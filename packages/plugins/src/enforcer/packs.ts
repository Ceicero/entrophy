// Shipped policy packs for `/enforcer policy import` and the dashboard's policy editor (ARCHITECTURE.md §19:
// "import packs: invites, mass-mentions, scam-links, external-links — no slur lists shipped; bring your own
// list"). Framework-free so it's safe to import from `apps/api` alongside `./schemas`.
import type { MatcherInput, PolicySeverityValue } from './schemas';

export interface PolicyPack {
  key: 'invites' | 'mass-mentions' | 'scam-links' | 'external-links';
  name: string;
  description: string;
  severity: PolicySeverityValue;
  matchers: MatcherInput[];
  suggestedAction: 'warn' | 'timeout' | 'mute' | 'kick' | 'ban' | 'dismiss';
}

export const POLICY_PACKS: PolicyPack[] = [
  {
    key: 'invites',
    name: 'Discord invite links',
    description:
      'Flags messages containing a Discord server invite link (discord.gg / discord.com/invite / discordapp.com/invite).',
    severity: 'MEDIUM',
    matchers: [{ type: 'invite', value: 'discord-invite' }],
    suggestedAction: 'warn',
  },
  {
    key: 'mass-mentions',
    name: 'Mass mentions',
    description: 'Flags messages that mention 5 or more users/roles at once — a common raid/spam pattern.',
    severity: 'MEDIUM',
    matchers: [{ type: 'mention_count', value: 5 }],
    suggestedAction: 'timeout',
  },
  {
    key: 'scam-links',
    name: 'Common scam/phishing domains',
    description:
      'Flags a small starter set of domain patterns seen in Discord Nitro/gift-card phishing scams. This is a starting point, not a comprehensive blocklist — add domains you observe on your own server via "/enforcer policy edit".',
    severity: 'HIGH',
    matchers: [
      {
        type: 'link_domain',
        value: [
          'discord-nitro.com',
          'discordnitro.gift',
          'discordapp-gift.com',
          'discocrd.com',
          'steamcommunlty.com',
          'steamcommunnity.com',
        ],
      },
    ],
    suggestedAction: 'timeout',
  },
  {
    key: 'external-links',
    name: 'Any external link',
    description:
      'Flags any message containing a link at all, regardless of domain. Useful for locked-down channels (e.g. support, announcements) where links should always go through a moderator first.',
    severity: 'LOW',
    matchers: [{ type: 'link_domain', value: [] }],
    suggestedAction: 'warn',
  },
];

export function getPolicyPack(key: string): PolicyPack | undefined {
  return POLICY_PACKS.find((pack) => pack.key === key);
}
