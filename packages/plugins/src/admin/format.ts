import { PermissionsBitField, type Guild } from 'discord.js';
import { describePermission, missingPermissions } from '@entrophy/core';
import type { PluginManifest } from '../sdk';

/**
 * For every loaded plugin's declared `manifest.permissions`, checks the bot's guild-level permissions and
 * returns a human-readable warning line for each one missing. Used by `/setup status` and `/permissions audit`.
 */
export function describeMissingBotPermissions(guild: Guild, manifests: PluginManifest[]): string[] {
  const botMember = guild.members.me;
  if (!botMember) {
    return ["I couldn't read my own member/permissions in this server — try re-inviting the bot."];
  }

  const have = botMember.permissions.bitfield;
  const warnings: string[] = [];

  for (const manifest of manifests) {
    for (const doc of manifest.permissions) {
      const bit = PermissionsBitField.resolve(doc.permission);
      const missing = missingPermissions(have, [bit]);
      if (missing.length === 0) continue;
      const optionalNote = doc.optional ? ' (optional)' : '';
      warnings.push(
        `**${manifest.name}** — missing **${describePermission(bit)}**${optionalNote} for ${doc.feature}. ${doc.fallback}`,
      );
    }
  }

  return warnings;
}

/** True if `roleId` sits below the bot's own highest role position in `guild` (the bot can't manage/outrank it). */
export function roleOutranksBot(guild: Guild, roleId: string): boolean {
  const botMember = guild.members.me;
  if (!botMember) return true;
  const role = guild.roles.cache.get(roleId);
  if (!role) return false;
  return role.position >= botMember.roles.highest.position;
}

/** Formats a byte count as a human-readable megabyte string, e.g. `42.3 MB`. */
export function formatMemoryMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Formats a second count as a compact human duration, e.g. `3d 4h`. */
export function formatUptime(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** Which of the two core setup requirements a guild is missing. */
export type SetupMissing = 'modRoles' | 'modLogChannel';

/**
 * How `/setup status` should describe a guild's setup:
 * - `wizard`: the guided wizard was completed (`setupCompletedAt` set);
 * - `configured`: wizard never run, but core config is complete (staff roles + mod-log channel — e.g. set from the dashboard or `/config`);
 * - `incomplete`: something core is still missing.
 */
export type SetupState =
  | { kind: 'wizard'; completedAt: string }
  | { kind: 'configured' }
  | { kind: 'incomplete'; missing: SetupMissing[] };

/**
 * Derives the setup state from actual config so the bot agrees with the API's guild overview (`setupIssues`):
 * complete ⇔ a mod-log channel is set AND at least one moderator or admin role exists (admin roles alone count
 * as staff). `setupCompletedAt` only says the wizard ran; it is never inferred or back-filled here.
 */
export function deriveSetupState(config: {
  setupCompletedAt: string | null;
  modRoleIds: string[];
  adminRoleIds: string[];
  modLogChannelId: string | null;
}): SetupState {
  if (config.setupCompletedAt) return { kind: 'wizard', completedAt: config.setupCompletedAt };
  const missing: SetupMissing[] = [];
  if (config.modRoleIds.length === 0 && config.adminRoleIds.length === 0) missing.push('modRoles');
  if (config.modLogChannelId === null) missing.push('modLogChannel');
  return missing.length === 0 ? { kind: 'configured' } : { kind: 'incomplete', missing };
}
