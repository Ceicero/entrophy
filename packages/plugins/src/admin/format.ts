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
      warnings.push(`**${manifest.name}** — missing **${describePermission(bit)}**${optionalNote} for ${doc.feature}. ${doc.fallback}`);
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
