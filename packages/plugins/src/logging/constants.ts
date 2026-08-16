import type { LogKind } from '../sdk';

/** Every `LogKind` value (ARCHITECTURE.md §7.5), as a literal tuple so it doubles as the zod enum source. */
export const ALL_LOG_KINDS = [
  'member.join',
  'member.leave',
  'message.edit',
  'message.delete',
  'role.update',
  'channel.update',
  'guild.update',
  'moderation.action',
  'voice.join',
  'voice.leave',
  'invite.use',
  'bot.error',
  'webhook.failure',
  'automod.trigger',
  'ticket.event',
  'verification.event',
] as const satisfies readonly LogKind[];

/**
 * Human-readable default titles per kind, used as an embed's title when a caller doesn't supply
 * `payload.title`, and in `/logs status`/`/logs set`/`/logs disable` choice labels.
 *
 * `LogKind` intentionally has fewer members than the raw Discord gateway events this plugin listens to — e.g.
 * `roleCreate`/`roleUpdate`/`roleDelete` and member role-assignment changes all route to `'role.update'`, and
 * `channelCreate`/`channelUpdate`/`channelDelete`/`threadCreate`/`threadDelete` all route to `'channel.update'`
 * (mirroring SPEC.md §D's single "Role changes" / "Channel and server setting changes" bullets, which don't
 * distinguish create/update/delete either). Individual event handlers still set a more specific `payload.title`
 * (e.g. "Role deleted") so the distinction survives in the embed and stored `LogEvent.payload`, even though the
 * `kind` column groups them for channel routing and `enabledKinds` toggles.
 */
export const LOG_KIND_LABELS: Record<LogKind, string> = {
  'member.join': 'Member joined',
  'member.leave': 'Member left',
  'message.edit': 'Message edited',
  'message.delete': 'Message deleted',
  'role.update': 'Role changed',
  'channel.update': 'Channel changed',
  'guild.update': 'Server updated',
  'moderation.action': 'Moderation action',
  'voice.join': 'Voice channel joined',
  'voice.leave': 'Voice channel left',
  'invite.use': 'Invite used',
  'bot.error': 'Bot error',
  'webhook.failure': 'Webhook delivery failed',
  'automod.trigger': 'Automod triggered',
  'ticket.event': 'Ticket event',
  'verification.event': 'Verification event',
};

export const REDACTION_PATTERN_MAX = 20;
export const REDACTION_PATTERN_MAX_LENGTH = 256;
