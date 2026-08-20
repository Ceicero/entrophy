import { describe, expect, it, vi } from 'vitest';
import { ChannelType, type Client } from 'discord.js';
import { createTestContext } from '../../sdk/testing';
import { createEnforcerService } from '../service';
import type { EnforcerConfig } from '../manifest';
import type { HostService } from '../../sdk/services';

function defaultConfig(overrides: Partial<EnforcerConfig> = {}): EnforcerConfig {
  return {
    ledgerChannelId: null,
    ledgerVisibility: 'staff',
    flagChannelId: null,
    muteRoleId: null,
    captureContext: true,
    contextBefore: 5,
    contextAfter: 3,
    excerptMaxChars: 300,
    autoFlagEnabled: true,
    exemptStaff: true,
    aiAssist: false,
    dmOnAction: true,
    defaultTimeoutMinutes: 60,
    defaultMuteMinutes: null,
    requireReasonOn: ['kick', 'ban'],
    allowedDecisions: ['warn', 'timeout', 'mute', 'kick', 'ban', 'dismiss'],
    banDeleteMessageSeconds: 0,
    ...overrides,
  };
}

/** Minimal `host` service fake — only `getGuildConfig` is exercised by `repairChannels`. */
function fakeHost(): HostService {
  return {
    enable: vi.fn(),
    disable: vi.fn(),
    isPluginEnabled: vi.fn(async () => true),
    listManifests: vi.fn(() => []),
    getManifest: vi.fn(() => undefined),
    getPluginAvailability: vi.fn(() => new Map()),
    getPluginHealth: vi.fn(async () => undefined),
    getPluginConfig: vi.fn(async () => ({})),
    setPluginConfig: vi.fn(async () => ({})),
    getGuildConfig: vi.fn(async () => ({
      guildId: 'g1',
      locale: 'en',
      timezone: 'UTC',
      adminRoleIds: [],
      modRoleIds: [],
      helperRoleIds: [],
      modLogChannelId: null,
      staffChannelId: null,
      appealsChannelId: null,
      fastActions: false,
      dataCollectionEnabled: false,
      logMessageContent: false,
      dmOnModeration: true,
      setupCompletedAt: null,
    })),
    updateGuildConfig: vi.fn(async () => ({}) as never),
    getBotStats: vi.fn(() => ({ wsPingMs: 0, uptimeSec: 0, guildCount: 0 })),
  } as unknown as HostService;
}

/** A manageable, non-thread, text-based channel fake — exactly what `applyMuteRoleToChannels` selects. */
function fakeManageableChannel(edit: (...args: unknown[]) => Promise<unknown>) {
  return {
    id: 'chan-1',
    isThread: () => false,
    manageable: true,
    isTextBased: () => true,
    isVoiceBased: () => false,
    permissionOverwrites: { edit },
  };
}

/** A manageable category fake — neither text- nor voice-based, only `type === GuildCategory` identifies it. */
function fakeCategoryChannel(edit: (...args: unknown[]) => Promise<unknown>) {
  return {
    id: 'cat-1',
    type: ChannelType.GuildCategory,
    isThread: () => false,
    manageable: true,
    isTextBased: () => false,
    isVoiceBased: () => false,
    permissionOverwrites: { edit },
  };
}

function fakeClientWithGuild(opts: {
  roleFetch: (roleId: string) => Promise<unknown>;
  channels?: unknown[];
}): Client<true> {
  const guild = {
    id: 'g1',
    channels: {
      // Ledger/flag-queue channel ids are null in every test's config, so `fetchManagedTextChannel` never
      // actually calls this — kept only so `repairChannels` has something to await if that ever changes.
      fetch: () => Promise.resolve(null),
      cache: new Map((opts.channels ?? []).map((c, i) => [String(i), c])),
    },
    roles: { fetch: opts.roleFetch },
  };
  return { guilds: { fetch: async () => guild } } as unknown as Client<true>;
}

describe('EnforcerService.repairChannels — mute role overwrites', () => {
  it('re-applies mute-role deny overwrites to every manageable channel when muteRoleId is set and the role exists', async () => {
    const edit1 = vi.fn(async () => undefined);
    const edit2 = vi.fn(async () => undefined);
    const role = { id: 'role-1' };
    const client = fakeClientWithGuild({
      roleFetch: async (id) => (id === 'role-1' ? role : null),
      channels: [fakeManageableChannel(edit1), fakeManageableChannel(edit2)],
    });
    const { ctx } = createTestContext({ config: defaultConfig({ muteRoleId: 'role-1' }), overrides: { client } });
    ctx.services.register('host', fakeHost());
    const service = createEnforcerService(ctx);

    const result = await service.repairChannels('g1');

    expect(result).toEqual({ muteApplied: 2, muteFailed: 0 });
    expect(edit1).toHaveBeenCalledWith(
      role,
      { SendMessages: false, SendMessagesInThreads: false, Speak: false, AddReactions: false },
      { reason: 'Enforcer: apply mute role overwrite' },
    );
    expect(edit2).toHaveBeenCalledTimes(1);
  });

  it('also re-applies to categories (they are neither text- nor voice-based, but hold their own overwrites — matching the channelCreate listener\'s scope, so "children inherit the deny" holds for categories that existed before setup/repair, not only ones created afterward)', async () => {
    const editCategory = vi.fn(async () => undefined);
    const editText = vi.fn(async () => undefined);
    const role = { id: 'role-1' };
    const client = fakeClientWithGuild({
      roleFetch: async () => role,
      channels: [fakeCategoryChannel(editCategory), fakeManageableChannel(editText)],
    });
    const { ctx } = createTestContext({ config: defaultConfig({ muteRoleId: 'role-1' }), overrides: { client } });
    ctx.services.register('host', fakeHost());
    const service = createEnforcerService(ctx);

    const result = await service.repairChannels('g1');

    expect(result).toEqual({ muteApplied: 2, muteFailed: 0 });
    expect(editCategory).toHaveBeenCalledWith(
      role,
      { SendMessages: false, SendMessagesInThreads: false, Speak: false, AddReactions: false },
      { reason: 'Enforcer: apply mute role overwrite' },
    );
  });

  it('skips the mute-role re-apply (returns 0/0) when muteRoleId is set but the role no longer exists', async () => {
    const edit = vi.fn(async () => undefined);
    const client = fakeClientWithGuild({
      roleFetch: async () => null,
      channels: [fakeManageableChannel(edit)],
    });
    const { ctx } = createTestContext({
      config: defaultConfig({ muteRoleId: 'stale-role' }),
      overrides: { client },
    });
    ctx.services.register('host', fakeHost());
    const service = createEnforcerService(ctx);

    const result = await service.repairChannels('g1');

    expect(result).toEqual({ muteApplied: 0, muteFailed: 0 });
    expect(edit).not.toHaveBeenCalled();
  });

  it('skips the mute-role re-apply (returns 0/0) when no muteRoleId is configured at all', async () => {
    const edit = vi.fn(async () => undefined);
    const roleFetch = vi.fn(async () => {
      throw new Error('roles.fetch should not be called when muteRoleId is null');
    });
    const client = fakeClientWithGuild({ roleFetch, channels: [fakeManageableChannel(edit)] });
    const { ctx } = createTestContext({ config: defaultConfig({ muteRoleId: null }), overrides: { client } });
    ctx.services.register('host', fakeHost());
    const service = createEnforcerService(ctx);

    const result = await service.repairChannels('g1');

    expect(result).toEqual({ muteApplied: 0, muteFailed: 0 });
    expect(roleFetch).not.toHaveBeenCalled();
    expect(edit).not.toHaveBeenCalled();
  });

  it('still reports ledger/flag-queue repair working via the {guildId} bot-actions envelope shape', async () => {
    const role = { id: 'role-1' };
    const client = fakeClientWithGuild({ roleFetch: async () => role, channels: [] });
    const { ctx } = createTestContext({ config: defaultConfig({ muteRoleId: 'role-1' }), overrides: { client } });
    ctx.services.register('host', fakeHost());
    const service = createEnforcerService(ctx);

    // `apps/bot/src/host/bot-actions.ts` calls every dispatched service method with a single
    // `{ guildId, payload, requestedBy }` object — mirrors that real call site (see `decision.test.ts`'s
    // equivalent envelope test for `decide`).
    const result = await service.repairChannels({ guildId: 'g1' } as unknown as string);

    expect(result).toEqual({ muteApplied: 0, muteFailed: 0 });
  });
});
