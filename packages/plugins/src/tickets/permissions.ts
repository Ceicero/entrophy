// Pure, unit-tested: builds the plain-data permission-overwrite list for a new CHANNEL-mode ticket channel.
// Kept discord.js-flag-typed but otherwise free of any live Guild/Client object so it can be tested without a
// gateway connection (see `packages/plugins/src/sdk/testing.ts`).
import { PermissionFlagsBits } from 'discord.js';

export interface TicketOverwriteInput {
  everyoneRoleId: string;
  openerId: string;
  supportRoleIds: string[];
  botId: string;
}

export interface TicketOverwrite {
  id: string;
  allow: bigint[];
  deny: bigint[];
}

const OPENER_ALLOW: bigint[] = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks,
];

const SUPPORT_ALLOW: bigint[] = [...OPENER_ALLOW];

const BOT_ALLOW: bigint[] = [
  ...OPENER_ALLOW,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageChannels,
];

/**
 * Builds the overwrite list for a new ticket channel: `@everyone` denied View, the opener and every configured
 * support role allowed View/Send/ReadHistory/AttachFiles/EmbedLinks, and the bot allowed the same plus
 * Manage Messages/Channels (ARCHITECTURE.md-adjacent TASK spec for `tickets`).
 */
export function buildTicketChannelOverwrites(input: TicketOverwriteInput): TicketOverwrite[] {
  const overwrites: TicketOverwrite[] = [
    { id: input.everyoneRoleId, allow: [], deny: [PermissionFlagsBits.ViewChannel] },
    { id: input.openerId, allow: OPENER_ALLOW, deny: [] },
    { id: input.botId, allow: BOT_ALLOW, deny: [] },
  ];

  const seen = new Set(overwrites.map((o) => o.id));
  for (const roleId of input.supportRoleIds) {
    if (seen.has(roleId)) continue;
    seen.add(roleId);
    overwrites.push({ id: roleId, allow: SUPPORT_ALLOW, deny: [] });
  }

  return overwrites;
}
