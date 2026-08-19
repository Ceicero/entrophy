import { describe, expect, it, vi } from 'vitest';
import { ChannelType } from 'discord.js';
import type { Logger } from 'pino';
import { createTestContext } from '../../sdk/testing';
import { channelCreateHandler } from '../events/channel-create';
import type { EnforcerConfig } from '../manifest';

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

interface FakeChannelOpts {
  type?: ChannelType;
  manageable?: boolean;
  isTextBased?: boolean;
  isVoiceBased?: boolean;
  roleFetch?: (roleId: string) => Promise<unknown>;
  edit?: (...args: unknown[]) => Promise<unknown>;
}

/** A `NonThreadGuildBasedChannel`-shaped fake with just enough surface for `channelCreateHandler`. */
function fakeChannel(opts: FakeChannelOpts = {}) {
  const edit = opts.edit ?? vi.fn(async () => undefined);
  const roleFetch = opts.roleFetch ?? (async () => null);
  return {
    id: 'chan-1',
    type: opts.type ?? ChannelType.GuildText,
    isThread: () => false,
    manageable: opts.manageable ?? true,
    isTextBased: () => opts.isTextBased ?? true,
    isVoiceBased: () => opts.isVoiceBased ?? false,
    guild: { id: 'g1', roles: { fetch: roleFetch } },
    permissionOverwrites: { edit },
  };
}

const MUTE_DENY = { SendMessages: false, SendMessagesInThreads: false, Speak: false, AddReactions: false };

function fakeLogger(): Logger {
  return { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } as unknown as Logger;
}

describe('channelCreateHandler — plugin-enablement gating', () => {
  it("declares guildIdOf, so the host gates this handler on enforcer being enabled for the channel's guild (same convention as message-create.ts) — this is how \"no-op when the plugin is disabled\" is achieved, not a self-check inside the handler", () => {
    const channel = fakeChannel();
    expect(channelCreateHandler.guildIdOf?.(channel as never)).toBe('g1');
  });
});

describe('channelCreateHandler — applies the mute-role overwrite', () => {
  it('applies the deny overwrite when muteRoleId is configured, the role exists, and the channel is manageable', async () => {
    const role = { id: 'role-1' };
    const edit = vi.fn(async () => undefined);
    const channel = fakeChannel({ edit, roleFetch: async (id) => (id === 'role-1' ? role : null) });
    const { ctx } = createTestContext({ config: defaultConfig({ muteRoleId: 'role-1' }) });

    await channelCreateHandler.handler(ctx, channel as never);

    expect(edit).toHaveBeenCalledWith(role, MUTE_DENY, {
      reason: 'Enforcer: apply mute role overwrite (new channel)',
    });
  });

  it('also applies to a newly created category, so its future children inherit the deny', async () => {
    const role = { id: 'role-1' };
    const edit = vi.fn(async () => undefined);
    const channel = fakeChannel({
      type: ChannelType.GuildCategory,
      isTextBased: false,
      isVoiceBased: false,
      edit,
      roleFetch: async () => role,
    });
    const { ctx } = createTestContext({ config: defaultConfig({ muteRoleId: 'role-1' }) });

    await channelCreateHandler.handler(ctx, channel as never);

    expect(edit).toHaveBeenCalledWith(role, MUTE_DENY, {
      reason: 'Enforcer: apply mute role overwrite (new channel)',
    });
  });
});

describe('channelCreateHandler — no-op conditions', () => {
  it('does nothing when muteRoleId is not configured', async () => {
    const edit = vi.fn(async () => undefined);
    const roleFetch = vi.fn(async () => ({ id: 'role-1' }));
    const channel = fakeChannel({ edit, roleFetch });
    const { ctx } = createTestContext({ config: defaultConfig({ muteRoleId: null }) });

    await channelCreateHandler.handler(ctx, channel as never);

    expect(roleFetch).not.toHaveBeenCalled();
    expect(edit).not.toHaveBeenCalled();
  });

  it('does nothing when the configured mute role no longer resolves', async () => {
    const edit = vi.fn(async () => undefined);
    const channel = fakeChannel({ edit, roleFetch: async () => null });
    const { ctx } = createTestContext({ config: defaultConfig({ muteRoleId: 'stale-role' }) });

    await channelCreateHandler.handler(ctx, channel as never);

    expect(edit).not.toHaveBeenCalled();
  });

  it('does nothing when the channel is not manageable', async () => {
    const edit = vi.fn(async () => undefined);
    const roleFetch = vi.fn(async () => ({ id: 'role-1' }));
    const channel = fakeChannel({ manageable: false, edit, roleFetch });
    const { ctx } = createTestContext({ config: defaultConfig({ muteRoleId: 'role-1' }) });

    await channelCreateHandler.handler(ctx, channel as never);

    // Manageability is checked before the config/role lookup, so neither should even run.
    expect(roleFetch).not.toHaveBeenCalled();
    expect(edit).not.toHaveBeenCalled();
  });

  it('does nothing for a channel type that is neither text-based, voice-based, nor a category', async () => {
    const edit = vi.fn(async () => undefined);
    const roleFetch = vi.fn(async () => ({ id: 'role-1' }));
    // No such "irrelevant" guild channel actually exists in discord.js today, but the handler's own type
    // guard should still hold defensively if a new non-overwrite-bearing channel type is ever added.
    const channel = fakeChannel({ type: 999 as ChannelType, isTextBased: false, isVoiceBased: false, edit, roleFetch });
    const { ctx } = createTestContext({ config: defaultConfig({ muteRoleId: 'role-1' }) });

    await channelCreateHandler.handler(ctx, channel as never);

    expect(roleFetch).not.toHaveBeenCalled();
    expect(edit).not.toHaveBeenCalled();
  });
});

describe('channelCreateHandler — never throws', () => {
  it('logs at warn and resolves instead of throwing when permissionOverwrites.edit rejects', async () => {
    const edit = vi.fn(async () => {
      throw new Error('Missing Permissions');
    });
    const role = { id: 'role-1' };
    const channel = fakeChannel({ edit, roleFetch: async () => role });
    const logger = fakeLogger();
    const { ctx } = createTestContext({
      config: defaultConfig({ muteRoleId: 'role-1' }),
      overrides: { logger },
    });

    await expect(channelCreateHandler.handler(ctx, channel as never)).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [meta, message] = (logger.warn as ReturnType<typeof vi.fn>).mock.calls[0] as [
      Record<string, unknown>,
      string,
    ];
    expect(message).toMatch(/failed to apply mute role overwrite/i);
    expect(meta.guildId).toBe('g1');
    expect(meta.channelId).toBe('chan-1');
  });

  it('logs at warn and resolves instead of throwing when the guild config lookup itself throws', async () => {
    const edit = vi.fn(async () => undefined);
    const channel = fakeChannel({ edit });
    const logger = fakeLogger();
    const { ctx } = createTestContext({ overrides: { logger } });
    ctx.getConfig = vi.fn(async () => {
      throw new Error('config store unavailable');
    });

    await expect(channelCreateHandler.handler(ctx, channel as never)).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(edit).not.toHaveBeenCalled();
  });
});
