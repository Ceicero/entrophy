// Site-wide copy that isn't generated from the plugin registry (ARCHITECTURE.md §17).

export const siteCopy = {
  tagline: 'The modular, compliance-first Discord bot for gaming communities.',
  heroTitle: 'Moderation your server can actually trust.',
  heroSubtitle:
    'Entrophy is an all-in-one Discord bot: moderation, automod, a policy-driven Enforcer, tickets, roles, leveling, and more — every module opt-in, every action logged, never Administrator.',
  whyGaming: {
    title: 'Built for gaming communities',
    intro:
      'Raids, toxic lobbies, tournament brackets, LFG spam, streamer alerts, and a leaderboard everyone actually checks — Entrophy is shaped around what a game server deals with every single day.',
    points: [
      {
        title: 'Raids & toxicity',
        body: 'Automod and the policy-driven Enforcer catch spam, invite drops, and rule violations fast, with dry-run tuning and a false-positive review queue so enforcement stays accurate, not trigger-happy.',
      },
      {
        title: 'Tournaments & LFG',
        body: 'Role panels sort players by game and rank, giveaways run fair prize drops, tickets handle bracket disputes, and community tools schedule scrims across timezones.',
      },
      {
        title: 'Streamer alerts',
        body: 'Optional Twitch and YouTube integrations post a clean "going live" alert the moment a member starts streaming — no polling scripts, no scraping.',
      },
      {
        title: 'Leveling that matters',
        body: 'Anti-farm XP, reputation, and a starboard reward the players who actually show up and contribute, not the ones who spam the loudest channel.',
      },
      {
        title: 'Tickets that don’t get lost',
        body: 'Button-driven support with staff assignment and transcripts means a player report or ban appeal never just falls off the bottom of a channel.',
      },
      {
        title: 'A record you can show sponsors',
        body: 'Every moderation action, every Enforcer decision, and every donation dollar is written to an append-only, exportable record — useful the moment a community grows past "just friends".',
      },
    ],
  },
  trust: {
    title: 'Trust & compliance',
    intro: 'The moat here is trust, not features. Entrophy is built so a server owner never has to just take our word for it.',
    points: [
      {
        title: 'Never Administrator',
        body: 'The bot requests a least-privilege permission set, documented per feature. It never asks for the Administrator permission, full stop.',
      },
      {
        title: 'Privacy-first defaults',
        body: 'Message content is never stored unless a feature explicitly needs it and a server admin turns it on. Logging and Enforcer context capture default to metadata only.',
      },
      {
        title: 'Ledgered moderation',
        body: 'Every moderation case and every Enforcer flag/decision gets an immutable case or record number, exportable as CSV, searchable by staff.',
      },
      {
        title: 'Blind, tamper-evident jury of one system',
        body: 'Config changes, plugin enables/disables, and dashboard actions all write to a full audit trail — "who changed this, and when" always has an answer.',
      },
      {
        title: 'Open about what’s optional',
        body: 'Economy is virtual currency only, disabled by default, never real money. Media, AI, and integrations only activate once a server explicitly opts in and configures them.',
      },
    ],
  },
  donateCta: {
    title: 'Help keep Entrophy running',
    body: 'Entrophy is community-run. Donations fund hosting and development — they’re one-time, non-refundable, and grant no perks or in-game advantages.',
  },
  footer: {
    tagline: 'Community-run Discord moderation, built in the open.',
  },
} as const;
