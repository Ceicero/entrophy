import { PermissionFlagsBits } from 'discord-api-types/v10';
import type { Job, Queue } from 'bullmq';
import type { Client, GuildMember } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import type { PluginContext } from '../../sdk';
import { createTestContext } from '../../sdk/testing';
import { configSchema, type RolesConfig } from '../manifest';
import { autoRoleApplyJob } from '../jobs/autorole-apply';
import { AUTO_ROLE_AUDIT_ACTION, applyAutoRoles, autoRoleJobId, type AutoRoleJobData } from '../service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// `autoRoles.roleIds`/`botRoleIds` are validated against the Discord snowflake shape (`/^\d{17,20}$/`) by the
// roles manifest's `autoRolesSchema`, so every fixture role id below is a realistic 18-digit id rather than a
// readable name — named constants keep the tests legible anyway.
const ROLE_MEMBER = '100000000000000001';
const ROLE_NEWCOMER = '100000000000000002';
const ROLE_MANAGED = '100000000000000003';
const ROLE_TOOHIGH = '100000000000000004';
const ROLE_GONE = '100000000000000005'; // never added to guild.roles — simulates a role that's since been deleted
const ROLE_ADMIN = '100000000000000006';
const ROLE_BOT_TAG = '100000000000000007';
const ROLE_OLD = '100000000000000008';

type AuditEntryArg = Parameters<PluginContext['audit']>[0];

/** Typed `ctx.audit` spy — keeps `mock.calls[0][0]` indexable under strict tuple typing. */
function auditMock() {
  return vi.fn(async (_entry: AuditEntryArg) => undefined);
}

/** Typed BullMQ `queue.add` spy. */
function queueAddMock() {
  return vi.fn(async (_name: string, _data: unknown, _opts?: unknown) => undefined);
}

function fakeRole(id: string, opts: { permissions?: bigint; position?: number; managed?: boolean } = {}) {
  return {
    id,
    permissions: { bitfield: opts.permissions ?? 0n },
    position: opts.position ?? 1,
    managed: opts.managed ?? false,
  };
}

interface FakeMemberOptions {
  guildId?: string;
  userId?: string;
  bot?: boolean;
  pending?: boolean;
  /** Roles that exist in the guild. */
  guildRoles?: ReturnType<typeof fakeRole>[];
  /** Roles the member already holds. */
  memberRoleIds?: string[];
  botTopPosition?: number;
  /** When true, `guild.members.fetch(userId)` rejects (member left) — for the delayed-job tests. */
  left?: boolean;
}

function fakeMember(opts: FakeMemberOptions = {}) {
  const guildId = opts.guildId ?? 'g1';
  const userId = opts.userId ?? 'u1';
  const rolesCache = new Map((opts.guildRoles ?? []).map((r) => [r.id, r]));
  const memberRoles = new Map((opts.memberRoleIds ?? []).map((id) => [id, { id }]));

  // Mirrors the real `RoleManager.fetch`: called with an id it resolves that one role (or null if it truly
  // doesn't exist); called with no id it would resolve the full cache (kept for shape-compatibility, though
  // `grantAutoRoles` only ever calls the single-id form now — see roles/service.ts).
  const rolesFetch = vi.fn(async (roleId?: string) => (roleId ? (rolesCache.get(roleId) ?? null) : rolesCache));
  const rolesAdd = vi.fn(async (_ids: string[], _reason?: string) => undefined);

  const guild: Record<string, unknown> = {
    id: guildId,
    roles: { cache: rolesCache, fetch: rolesFetch },
  };

  const member = {
    id: userId,
    pending: opts.pending ?? false,
    user: { id: userId, bot: opts.bot ?? false, username: 'tester' },
    guild,
    roles: { cache: memberRoles, add: rolesAdd },
  };

  guild.members = {
    me: { roles: { highest: { position: opts.botTopPosition ?? 10 } } },
    fetch: async (id: string) => {
      if (opts.left || id !== userId) throw new Error('Unknown Member');
      return member;
    },
  };

  /** A `Client` whose `guilds.fetch` resolves to this fixture's guild — for the delayed-job processor tests. */
  const client = { guilds: { fetch: async () => guild } } as unknown as Client<true>;

  return { member: member as unknown as GuildMember, guild, client, rolesAdd, rolesFetch };
}

function rolesConfig(patch: Partial<RolesConfig['autoRoles']> = {}, allowElevatedRoles = false): RolesConfig {
  return configSchema.parse({
    allowElevatedRoles,
    autoRoles: { enabled: true, roleIds: [ROLE_MEMBER], botRoleIds: [ROLE_BOT_TAG], delaySeconds: 0, ...patch },
  });
}

// ---------------------------------------------------------------------------
// applyAutoRoles (immediate path)
// ---------------------------------------------------------------------------

describe('applyAutoRoles — immediate (delay 0)', () => {
  it('adds only the assignable roles and writes a roles.autorole.apply audit row', async () => {
    const audit = auditMock();
    const { ctx } = createTestContext({ overrides: { audit } });
    const { member, rolesAdd, rolesFetch } = fakeMember({
      guildRoles: [
        fakeRole(ROLE_MEMBER, { position: 2 }),
        fakeRole(ROLE_NEWCOMER, { position: 3 }),
        fakeRole(ROLE_MANAGED, { managed: true, position: 2 }),
        fakeRole(ROLE_TOOHIGH, { position: 15 }),
      ],
    });

    await applyAutoRoles(
      ctx,
      member,
      rolesConfig({ roleIds: [ROLE_MEMBER, ROLE_NEWCOMER, ROLE_MANAGED, ROLE_TOOHIGH, ROLE_GONE] }),
    );

    // Only the one role missing from cache (ROLE_GONE) triggers a fetch — the rest resolve from cache alone.
    expect(rolesFetch).toHaveBeenCalledWith(ROLE_GONE);
    expect(rolesAdd).toHaveBeenCalledTimes(1);
    expect(rolesAdd.mock.calls[0]![0]).toEqual([ROLE_MEMBER, ROLE_NEWCOMER]);
    expect(rolesAdd.mock.calls[0]![1]).toBe('Auto-role on join');

    expect(audit).toHaveBeenCalledTimes(1);
    const entry = audit.mock.calls[0]![0] as unknown as {
      action: string;
      guildId: string;
      targetId: string;
      actorType: string;
      after: { roleIds: string[]; skipped: { roleId: string; reason: string }[] };
    };
    expect(entry.action).toBe(AUTO_ROLE_AUDIT_ACTION);
    expect(entry.guildId).toBe('g1');
    expect(entry.targetId).toBe('u1');
    expect(entry.actorType).toBe('system');
    expect(entry.after.roleIds).toEqual([ROLE_MEMBER, ROLE_NEWCOMER]);
    expect(entry.after.skipped).toEqual(
      expect.arrayContaining([
        { roleId: ROLE_MANAGED, reason: 'managed' },
        { roleId: ROLE_TOOHIGH, reason: 'hierarchy' },
        { roleId: ROLE_GONE, reason: 'missing' },
      ]),
    );
  });

  it('skips an elevated role and reports it in after.skipped with reason "elevated"', async () => {
    const audit = auditMock();
    const { ctx } = createTestContext({ overrides: { audit } });
    const { member, rolesAdd } = fakeMember({
      guildRoles: [
        fakeRole(ROLE_MEMBER, { position: 2 }),
        fakeRole(ROLE_ADMIN, { permissions: PermissionFlagsBits.Administrator, position: 2 }),
      ],
    });

    await applyAutoRoles(ctx, member, rolesConfig({ roleIds: [ROLE_MEMBER, ROLE_ADMIN] }));

    expect(rolesAdd.mock.calls[0]![0]).toEqual([ROLE_MEMBER]);
    const entry = audit.mock.calls[0]![0] as unknown as {
      after: { roleIds: string[]; skipped: { roleId: string; reason: string }[] };
    };
    expect(entry.after.skipped).toEqual([{ roleId: ROLE_ADMIN, reason: 'elevated' }]);
  });

  it('allows an elevated role when allowElevatedRoles is on', async () => {
    const { ctx } = createTestContext();
    const { member, rolesAdd } = fakeMember({
      guildRoles: [fakeRole(ROLE_ADMIN, { permissions: PermissionFlagsBits.BanMembers, position: 2 })],
    });

    await applyAutoRoles(ctx, member, rolesConfig({ roleIds: [ROLE_ADMIN] }, true));

    expect(rolesAdd.mock.calls[0]![0]).toEqual([ROLE_ADMIN]);
  });

  it('uses the bot list for bot accounts and skips roles the member already has', async () => {
    const audit = auditMock();
    const { ctx } = createTestContext({ overrides: { audit } });
    const { member, rolesAdd } = fakeMember({
      bot: true,
      guildRoles: [fakeRole(ROLE_BOT_TAG, { position: 2 }), fakeRole(ROLE_MEMBER, { position: 2 })],
      memberRoleIds: [ROLE_BOT_TAG],
    });

    await applyAutoRoles(ctx, member, rolesConfig());

    // Only role in the bot list is already held → nothing to add, and no audit row for a no-op.
    expect(rolesAdd).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('does nothing when the applicable list is empty', async () => {
    const { ctx } = createTestContext();
    const { member, rolesAdd, rolesFetch } = fakeMember({ bot: true });

    await applyAutoRoles(ctx, member, rolesConfig({ botRoleIds: [] }));

    expect(rolesFetch).not.toHaveBeenCalled();
    expect(rolesAdd).not.toHaveBeenCalled();
  });

  it('never throws when the Discord role add fails (logs and audits the failure instead)', async () => {
    const audit = auditMock();
    const { ctx } = createTestContext({ overrides: { audit } });
    const { member, rolesAdd } = fakeMember({ guildRoles: [fakeRole(ROLE_MEMBER, { position: 2 })] });
    rolesAdd.mockRejectedValueOnce(new Error('Missing Permissions'));

    await expect(applyAutoRoles(ctx, member, rolesConfig())).resolves.toBeUndefined();

    const entry = audit.mock.calls[0]![0] as unknown as { after: { roleIds: string[]; failed?: string[] } };
    expect(entry.after.roleIds).toEqual([]);
    expect(entry.after.failed).toEqual([ROLE_MEMBER]);
  });
});

// ---------------------------------------------------------------------------
// applyAutoRoles (delayed path)
// ---------------------------------------------------------------------------

describe('applyAutoRoles — delayed (delay > 0)', () => {
  it('schedules an autorole-apply job with the dedupe jobId (dash-separated, removeOnFail) and does NOT add roles now', async () => {
    const add = queueAddMock();
    const queue = vi.fn((_name: string) => ({ add }) as unknown as Queue);
    const { ctx } = createTestContext({ overrides: { queue } });
    const { member, rolesAdd } = fakeMember({ guildRoles: [fakeRole(ROLE_MEMBER, { position: 2 })] });

    await applyAutoRoles(ctx, member, rolesConfig({ delaySeconds: 60 }));

    expect(queue).toHaveBeenCalledWith('autorole-apply');
    expect(add).toHaveBeenCalledTimes(1);
    const [jobName, data, opts] = add.mock.calls[0]! as unknown as [
      string,
      AutoRoleJobData,
      { jobId: string; delay: number; removeOnComplete: boolean; removeOnFail: boolean },
    ];
    expect(jobName).toBe('autorole-apply');
    expect(data).toEqual({ guildId: 'g1', userId: 'u1', roleIds: [ROLE_MEMBER] });
    expect(opts.jobId).toBe(autoRoleJobId('g1', 'u1'));
    // BullMQ 5.x rejects a custom jobId containing ':' unless it has exactly 3 segments — dashes sidestep that.
    expect(opts.jobId).toBe('autorole-g1-u1');
    expect(opts.delay).toBe(60_000);
    expect(opts.removeOnComplete).toBe(true);
    // A failed run must not permanently block later joins for the same guild+user (deterministic jobId).
    expect(opts.removeOnFail).toBe(true);

    expect(rolesAdd).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// autorole-apply job processor
// ---------------------------------------------------------------------------

function jobFor(data: AutoRoleJobData): Job<AutoRoleJobData> {
  return { data } as unknown as Job<AutoRoleJobData>;
}

describe('autorole-apply job', () => {
  it('has the spec name (queue becomes roles.autorole-apply)', () => {
    expect(autoRoleApplyJob.name).toBe('autorole-apply');
  });

  it('does nothing when the member has left before the delay elapsed', async () => {
    const audit = auditMock();
    const { client, rolesAdd } = fakeMember({
      left: true,
      guildRoles: [fakeRole(ROLE_MEMBER, { position: 2 })],
    });
    const { ctx } = createTestContext({
      config: rolesConfig({ delaySeconds: 60 }),
      overrides: { audit, client },
    });

    await autoRoleApplyJob.processor(ctx, jobFor({ guildId: 'g1', userId: 'u1', roleIds: [ROLE_MEMBER] }));

    expect(rolesAdd).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('does nothing while the member is still pending membership screening', async () => {
    const { client, rolesAdd } = fakeMember({
      pending: true,
      guildRoles: [fakeRole(ROLE_MEMBER, { position: 2 })],
    });
    const { ctx } = createTestContext({
      config: rolesConfig({ delaySeconds: 60 }),
      overrides: { client },
    });

    await autoRoleApplyJob.processor(ctx, jobFor({ guildId: 'g1', userId: 'u1', roleIds: [ROLE_MEMBER] }));

    expect(rolesAdd).not.toHaveBeenCalled();
  });

  it('only applies roles that are STILL in the current config (admin edited the list while waiting)', async () => {
    const audit = auditMock();
    const { client, rolesAdd } = fakeMember({
      guildRoles: [fakeRole(ROLE_MEMBER, { position: 2 }), fakeRole(ROLE_OLD, { position: 2 })],
    });
    // The job was scheduled with [ROLE_MEMBER, ROLE_OLD] but the admin has since removed ROLE_OLD.
    const { ctx } = createTestContext({
      config: rolesConfig({ roleIds: [ROLE_MEMBER], delaySeconds: 60 }),
      overrides: { audit, client },
    });

    await autoRoleApplyJob.processor(
      ctx,
      jobFor({ guildId: 'g1', userId: 'u1', roleIds: [ROLE_MEMBER, ROLE_OLD] }),
    );

    expect(rolesAdd).toHaveBeenCalledTimes(1);
    expect(rolesAdd.mock.calls[0]![0]).toEqual([ROLE_MEMBER]);
    expect(audit).toHaveBeenCalledTimes(1);
  });

  it('does nothing when auto-roles were disabled while the job waited', async () => {
    const { client, rolesAdd } = fakeMember({ guildRoles: [fakeRole(ROLE_MEMBER, { position: 2 })] });
    const { ctx } = createTestContext({
      config: rolesConfig({ enabled: false, delaySeconds: 60 }),
      overrides: { client },
    });

    await autoRoleApplyJob.processor(ctx, jobFor({ guildId: 'g1', userId: 'u1', roleIds: [ROLE_MEMBER] }));

    expect(rolesAdd).not.toHaveBeenCalled();
  });
});
