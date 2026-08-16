import { describe, expect, it } from 'vitest';
import { evaluate, type NormalizedMessage, type Policy } from '../engine';
import { getPolicyPack, POLICY_PACKS } from '../packs';
import { matcherSchema } from '../schemas';

function baseMessage(overrides: Partial<NormalizedMessage> = {}): NormalizedMessage {
  return {
    content: '',
    authorId: 'u1',
    authorRoleIds: [],
    channelId: 'c1',
    mentionsCount: 0,
    attachments: [],
    links: [],
    invites: [],
    isStaff: false,
    ...overrides,
  };
}

function packAsPolicy(pack: (typeof POLICY_PACKS)[number]): Policy {
  return { id: pack.key, name: pack.name, enabled: true, severity: pack.severity, matchers: pack.matchers, channelIds: [], exemptRoleIds: [], exemptChannelIds: [] };
}

describe('POLICY_PACKS', () => {
  it('every shipped pack has at least one matcher that passes matcherSchema', () => {
    for (const pack of POLICY_PACKS) {
      expect(pack.matchers.length).toBeGreaterThan(0);
      for (const matcher of pack.matchers) {
        expect(matcherSchema.safeParse(matcher).success).toBe(true);
      }
    }
  });

  it('getPolicyPack finds a pack by key and returns undefined otherwise', () => {
    expect(getPolicyPack('invites')?.key).toBe('invites');
    expect(getPolicyPack('nonexistent')).toBeUndefined();
  });

  it('"invites" fires on a message containing a Discord invite', () => {
    const policy = packAsPolicy(getPolicyPack('invites')!);
    expect(evaluate(baseMessage({ invites: ['discord.gg/abc123'] }), [policy])).toHaveLength(1);
    expect(evaluate(baseMessage({ invites: [] }), [policy])).toHaveLength(0);
  });

  it('"mass-mentions" fires at 5+ mentions', () => {
    const policy = packAsPolicy(getPolicyPack('mass-mentions')!);
    expect(evaluate(baseMessage({ mentionsCount: 5 }), [policy])).toHaveLength(1);
    expect(evaluate(baseMessage({ mentionsCount: 4 }), [policy])).toHaveLength(0);
  });

  it('"scam-links" fires on one of its starter domains, not on an unrelated one', () => {
    const policy = packAsPolicy(getPolicyPack('scam-links')!);
    expect(evaluate(baseMessage({ links: ['https://discord-nitro.com/free'] }), [policy])).toHaveLength(1);
    expect(evaluate(baseMessage({ links: ['https://discord.com/'] }), [policy])).toHaveLength(0);
  });

  it('"external-links" fires on any link at all', () => {
    const policy = packAsPolicy(getPolicyPack('external-links')!);
    expect(evaluate(baseMessage({ links: ['https://anything.example/'] }), [policy])).toHaveLength(1);
    expect(evaluate(baseMessage({ links: [] }), [policy])).toHaveLength(0);
  });
});
