import type { EmbedBuilder } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { createTestContext } from '../../sdk/testing';
import type { CommandContext } from '../../sdk';
import { command } from '../commands/automod';
import { handleRuleDryRun } from '../commands/rule-handlers';
import type { AutomodConfig } from '../manifest';
import en from '../locales/en.json';

const CONFIG: AutomodConfig = {
  dryRun: false,
  alertChannelId: null,
  quarantineRoleId: null,
  exemptStaff: true,
  defaultTimeoutMs: 600_000,
  raidLockdown: 'none',
  raidLockdownMinutes: 15,
};

/** Resolves an `automod.<path>` key against the real bundle, so the assertions below pin the text a moderator sees. */
function translate(key: string, vars: Record<string, string | number> = {}): string {
  const value = key
    .replace(/^automod\./, '')
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en);
  return String(value).replace(/\{(\w+)\}/g, (_match, name: string) => String(vars[name] ?? ''));
}

function commandContext(options: { state: string; rule: { id: string; name: string; dryRun: boolean } }) {
  const updates: { where: unknown; data: Record<string, unknown> }[] = [];
  const replies: string[] = [];

  const { ctx } = createTestContext({
    config: CONFIG,
    prismaOverrides: {
      automodRule: {
        findFirst: async () => options.rule,
        update: async (...args: unknown[]) => {
          const arg = args[0] as { where: unknown; data: Record<string, unknown> };
          updates.push(arg);
          return { ...options.rule, ...arg.data };
        },
      },
    },
  });

  const c = {
    interaction: {
      options: {
        getString: (name: string) => (name === 'rule' ? options.rule.id : options.state),
      },
      user: { id: 'mod1' },
      reply: async (payload: { embeds: EmbedBuilder[] }) => {
        replies.push(payload.embeds[0]?.data.description ?? '');
      },
    },
    ctx,
    guildId: 'g1',
    staffLevel: 'moderator',
    locale: 'en',
    t: translate,
    config: async () => CONFIG,
  } as unknown as CommandContext;

  return { c, updates, replies };
}

describe('/automod rule dryrun', () => {
  it('is a real subcommand of /automod rule', () => {
    const json = command.data.toJSON() as { options?: { name: string; options?: { name: string }[] }[] };
    const ruleGroup = json.options?.find((option) => option.name === 'rule');
    expect(ruleGroup?.options?.map((sub) => sub.name)).toContain('dryrun');
  });

  it('clears a rule out of dry-run — the flag only the dashboard used to be able to write', async () => {
    const { c, updates, replies } = commandContext({
      state: 'off',
      rule: { id: 'r1', name: 'test-words', dryRun: true },
    });

    await handleRuleDryRun(c);

    expect(updates).toHaveLength(1);
    expect(updates[0]?.data).toEqual({ dryRun: false });
    expect(replies[0]).toContain('out of dry-run');
  });

  it('puts a rule back into dry-run', async () => {
    const { c, updates } = commandContext({
      state: 'on',
      rule: { id: 'r1', name: 'test-words', dryRun: false },
    });

    await handleRuleDryRun(c);

    expect(updates[0]?.data).toEqual({ dryRun: true });
  });

  it('says so when guild-wide dry-run still blocks the rule from acting', async () => {
    const updates: { data: Record<string, unknown> }[] = [];
    const replies: string[] = [];
    const guildDryRun: AutomodConfig = { ...CONFIG, dryRun: true };
    const rule = { id: 'r1', name: 'test-words', dryRun: true };

    const { ctx } = createTestContext({
      config: guildDryRun,
      prismaOverrides: {
        automodRule: {
          findFirst: async () => rule,
          update: async (...args: unknown[]) => {
            const arg = args[0] as { data: Record<string, unknown> };
            updates.push(arg);
            return { ...rule, ...arg.data };
          },
        },
      },
    });

    const c = {
      interaction: {
        options: { getString: (name: string) => (name === 'rule' ? rule.id : 'off') },
        user: { id: 'mod1' },
        reply: async (payload: { embeds: EmbedBuilder[] }) => {
          replies.push(payload.embeds[0]?.data.description ?? '');
        },
      },
      ctx,
      guildId: 'g1',
      staffLevel: 'moderator',
      locale: 'en',
      t: translate,
      config: async () => guildDryRun,
    } as unknown as CommandContext;

    await handleRuleDryRun(c);

    expect(updates[0]?.data).toEqual({ dryRun: false });
    expect(replies[0]).toContain('guild-wide dry-run is still');
  });
});

describe('rule-creation message', () => {
  it('names a command that can actually clear the dry-run of a new rule', () => {
    // The old text pointed at `/automod dryrun off`, which only moves the guild-wide flag — so following the
    // bot's own instructions left the rule inert forever.
    expect(en.rule.created).toContain('/automod rule dryrun');
  });
});
