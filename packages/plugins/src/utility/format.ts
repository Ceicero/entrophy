// Shared formatting helpers for the `/utility` info commands (pure functions, easy to unit-test in isolation).
import { ChannelType, PermissionsBitField, type GuildBasedChannel } from 'discord.js';

const CHANNEL_TYPE_LABELS: Partial<Record<ChannelType, string>> = {
  [ChannelType.GuildText]: 'Text channel',
  [ChannelType.GuildVoice]: 'Voice channel',
  [ChannelType.GuildCategory]: 'Category',
  [ChannelType.GuildAnnouncement]: 'Announcement channel',
  [ChannelType.AnnouncementThread]: 'Announcement thread',
  [ChannelType.PublicThread]: 'Public thread',
  [ChannelType.PrivateThread]: 'Private thread',
  [ChannelType.GuildStageVoice]: 'Stage channel',
  [ChannelType.GuildForum]: 'Forum',
  [ChannelType.GuildMedia]: 'Media channel',
};

/** Human-readable label for a guild channel's type. */
export function describeChannelType(type: GuildBasedChannel['type']): string {
  return CHANNEL_TYPE_LABELS[type] ?? `Channel type ${type}`;
}

const KEY_PERMISSION_ORDER: (keyof typeof PermissionsBitField.Flags)[] = [
  'Administrator',
  'ManageGuild',
  'BanMembers',
  'KickMembers',
  'ManageRoles',
  'ManageChannels',
  'ManageMessages',
  'ModerateMembers',
  'ManageWebhooks',
  'MentionEveryone',
  'ManageNicknames',
  'ManageThreads',
  'ManageEvents',
  'ManageEmojisAndStickers',
];

/**
 * Summarizes a member's notable permissions for `/utility userinfo`: `Administrator` short-circuits to a
 * single line; otherwise lists the highest-signal permissions present (from `KEY_PERMISSION_ORDER`) plus a
 * count of any other granted permissions, or a plain "no notable permissions" message.
 */
export function summarizePermissions(permissions: PermissionsBitField): string {
  if (permissions.has(PermissionsBitField.Flags.Administrator)) {
    return 'Administrator (all permissions)';
  }

  const all = permissions.toArray();
  const notable = KEY_PERMISSION_ORDER.filter((flag) => permissions.has(PermissionsBitField.Flags[flag]));
  const otherCount = all.length - notable.length;

  if (notable.length === 0) {
    return otherCount > 0
      ? `No notable permissions (${otherCount} other permission${otherCount === 1 ? '' : 's'})`
      : 'No notable permissions';
  }

  const readable = notable.map((flag) => flag.replace(/([a-z])([A-Z])/g, '$1 $2'));
  return otherCount > 0 ? `${readable.join(', ')}, +${otherCount} more` : readable.join(', ');
}

/** `#RRGGBB` string for a role's color, or `null` for the default (no color) role. */
export function formatRoleColor(hexColor: string): string | null {
  return hexColor === '#000000' ? null : hexColor;
}
