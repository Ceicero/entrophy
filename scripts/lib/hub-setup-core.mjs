// Pure reconcile logic for scripts/hub-setup.mjs — no discord.js, no REST calls, no filesystem, no network.
// Every function here takes plain data in and returns plain data out, so it can be unit-tested without a
// live Discord connection or a real bot token (see scripts/__tests__/hub-setup.test.mjs). The orchestration
// (fetching current guild state, calling the Discord REST API, printing progress) lives in scripts/hub-setup.mjs
// and imports these helpers. See infra/hub/README.md for the plan JSON schema this operates on.
import { ChannelType, OverwriteType, PermissionFlagsBits } from 'discord-api-types/v10';

/** Staff roles that always get access to boosterOnly/roleOnly-gated channels alongside the named allow-list. */
export const STAFF_ROLE_NAMES = ['Helper', 'Moderator', 'Admin', 'Owner'];

/**
 * Channels the bot always needs to be able to view and post in, regardless of the channel's `botNeeds` field —
 * it posts welcomes, mod-log/ledger entries, enforcer queue items, level-up announcements, stream alerts,
 * giveaway messages, the FAQ sticky, and update/announcement changelogs.
 */
export const BOT_ALWAYS_VIEW_CHANNELS = [
  'mod-log',
  'mod-ledger',
  'enforcer-queue',
  'level-ups',
  'welcome',
  'stream-alerts',
  'giveaways',
  'faq',
  'updates',
  'announcements',
];

/** Permissions granted to the bot's own member overwrite in BOT_ALWAYS_VIEW_CHANNELS. */
export const BOT_ALWAYS_PERMS = ['ViewChannel', 'SendMessages', 'EmbedLinks'];

/** Maps the plan's `type` string to a Discord channel type integer. */
export const CHANNEL_TYPE_MAP = {
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  announcement: ChannelType.GuildAnnouncement,
};

export const ROLE_OVERWRITE_TYPE = OverwriteType.Role;
export const MEMBER_OVERWRITE_TYPE = OverwriteType.Member;

// ---------------------------------------------------------------------------------------------------------
// Plan validation
// ---------------------------------------------------------------------------------------------------------

/**
 * Structural validation of a hub plan JSON. Checked before anything else runs — a malformed plan should fail
 * fast with a readable list of problems rather than crash halfway through a partially-applied reconcile.
 * Returns `{ ok, errors }`; `errors` is always an array (empty when `ok`).
 */
export function validatePlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== 'object') {
    return { ok: false, errors: ['plan is not an object'] };
  }
  if (!plan.guildId) errors.push('missing guildId');
  if (!plan.ownerUserId) errors.push('missing ownerUserId');
  if (!Array.isArray(plan.roles_top_to_bottom) || plan.roles_top_to_bottom.length === 0) {
    errors.push('roles_top_to_bottom must be a non-empty array');
  }
  if (plan.pingRoles !== undefined && !Array.isArray(plan.pingRoles)) {
    errors.push('pingRoles must be an array when present');
  }
  if (!Array.isArray(plan.categories_in_order) || plan.categories_in_order.length === 0) {
    errors.push('categories_in_order must be a non-empty array');
  }
  if (!plan.mutedOverwrites || !Array.isArray(plan.mutedOverwrites.deny)) {
    errors.push('mutedOverwrites.deny must be an array');
  }
  if (!plan.messages || typeof plan.messages !== 'object') {
    errors.push('missing messages');
  } else if (!Array.isArray(plan.messages.rules)) {
    errors.push('messages.rules must be an array');
  }

  for (const [i, role] of (plan.roles_top_to_bottom ?? []).entries()) {
    if (!role?.name) errors.push(`roles_top_to_bottom[${i}] missing name`);
    if (!Array.isArray(role?.permissions)) errors.push(`roles_top_to_bottom[${i}] (${role?.name}) missing permissions array`);
  }
  for (const [ci, cat] of (plan.categories_in_order ?? []).entries()) {
    if (!cat?.name) errors.push(`categories_in_order[${ci}] missing name`);
    if (!Array.isArray(cat?.channels)) {
      errors.push(`categories_in_order[${ci}] (${cat?.name}) missing channels array`);
      continue;
    }
    for (const [chi, ch] of cat.channels.entries()) {
      if (!ch?.name) errors.push(`categories_in_order[${ci}].channels[${chi}] missing name`);
      if (!ch?.type || !(ch.type in CHANNEL_TYPE_MAP)) {
        errors.push(`categories_in_order[${ci}].channels[${chi}] (${ch?.name}) has unknown type "${ch?.type}"`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------------------------------------

/**
 * Merges `roles_top_to_bottom` and `pingRoles` into one flat, defaulted, top-to-bottom ordered array.
 * Ping roles default to hoist:false (not split out in the member list) and mentionable:true (so anyone can
 * @-mention them to opt in/out) unless the plan overrides those explicitly.
 */
export function normalizePlanRoles(plan) {
  const main = (plan.roles_top_to_bottom ?? []).map((r) => ({
    name: r.name,
    color: r.color ?? '#99aab5',
    hoist: r.hoist ?? false,
    mentionable: r.mentionable ?? false,
    permissions: r.permissions ?? [],
    assignTo: r.assignTo ?? [],
    isPingRole: false,
  }));
  const pings = (plan.pingRoles ?? []).map((r) => ({
    name: r.name,
    color: r.color ?? '#99aab5',
    hoist: r.hoist ?? false,
    mentionable: r.mentionable ?? true,
    permissions: r.permissions ?? [],
    assignTo: r.assignTo ?? [],
    isPingRole: true,
  }));
  return [...main, ...pings];
}

/** `"#f1c40f"` -> `15844367`. Non-string/invalid input safely resolves to `0` (Discord's "no color"). */
export function hexToInt(hex) {
  if (typeof hex !== 'string') return 0;
  const parsed = parseInt(hex.replace(/^#/u, ''), 16);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Sums permission name strings (e.g. `"ManageMessages"`) into the bigint bitfield Discord's REST API expects.
 * Unknown names (typos, permissions that don't exist) are collected in `unknown` rather than throwing, so the
 * caller can surface a clear warning and continue reconciling everything else.
 */
export function permissionsToBitfield(names) {
  let value = 0n;
  const unknown = [];
  for (const name of names ?? []) {
    const bit = PermissionFlagsBits[name];
    if (bit === undefined) {
      unknown.push(name);
      continue;
    }
    value |= bit;
  }
  return { value, unknown };
}

/**
 * Finds the existing guild role a plan role spec refers to: first by id (via `plan.existing.roles[spec.name]`),
 * falling back to an exact (case-sensitive) name match. Returns `null` when neither resolves — the role needs
 * to be created.
 */
export function resolveRoleTarget({ spec, existingRoles, existingIdMap }) {
  const byId = existingIdMap?.[spec.name];
  if (byId) {
    const found = existingRoles.find((r) => r.id === byId);
    if (found) return found;
  }
  return existingRoles.find((r) => r.name === spec.name) ?? null;
}

/**
 * Computes the minimal PATCH payload to bring an existing role's color/hoist/mentionable/permissions in line
 * with the plan. Returns `{ patch, notes, hasChanges }` — `patch` only contains keys that actually differ, so
 * an already-correct role produces `hasChanges: false` and an empty patch (a no-op update is never sent).
 */
export function diffRolePayload(existingRole, spec) {
  const patch = {};
  const notes = [];

  const desiredColor = hexToInt(spec.color);
  if (existingRole.color !== desiredColor) patch.color = desiredColor;

  if (Boolean(existingRole.hoist) !== Boolean(spec.hoist)) patch.hoist = Boolean(spec.hoist);
  if (Boolean(existingRole.mentionable) !== Boolean(spec.mentionable)) patch.mentionable = Boolean(spec.mentionable);

  const { value: desiredPerms, unknown } = permissionsToBitfield(spec.permissions);
  if (unknown.length > 0) {
    notes.push(`role "${spec.name}": unknown permission name(s) ${unknown.join(', ')} — ignored`);
  }
  const desiredPermsStr = desiredPerms.toString();
  if (String(existingRole.permissions) !== desiredPermsStr) patch.permissions = desiredPermsStr;

  return { patch, notes, hasChanges: Object.keys(patch).length > 0 };
}

/**
 * Walks every normalized role spec (top-to-bottom) and decides, against current guild state, whether it needs
 * to be created, updated, left alone (noop), or skipped because the matched existing role sits at/above the
 * bot's own top role position (Discord forbids editing those — the bot would get a 403). Does NOT reorder
 * roles; see `computeRolePositions` for that, which needs real ids for newly-created roles first.
 */
export function planRoleActions({ specs, existingRoles, existingIdMap, botTopPosition }) {
  const actions = [];
  const notes = [];

  for (const spec of specs) {
    const existing = resolveRoleTarget({ spec, existingRoles, existingIdMap });

    if (!existing) {
      const { value: perms, unknown } = permissionsToBitfield(spec.permissions);
      if (unknown.length > 0) {
        notes.push(`role "${spec.name}": unknown permission name(s) ${unknown.join(', ')} — ignored`);
      }
      actions.push({
        type: 'create',
        name: spec.name,
        payload: {
          name: spec.name,
          color: hexToInt(spec.color),
          hoist: Boolean(spec.hoist),
          mentionable: Boolean(spec.mentionable),
          permissions: perms.toString(),
        },
      });
      continue;
    }

    if (existing.position >= botTopPosition) {
      actions.push({ type: 'skip_above_bot', name: spec.name, id: existing.id, position: existing.position });
      notes.push(`role "${spec.name}" (id ${existing.id}) sits at/above the bot's own top role (position ${existing.position} >= ${botTopPosition}) — left untouched`);
      continue;
    }

    const { patch, notes: diffNotes, hasChanges } = diffRolePayload(existing, spec);
    notes.push(...diffNotes);
    actions.push(
      hasChanges
        ? { type: 'update', name: spec.name, id: existing.id, patch }
        : { type: 'noop', name: spec.name, id: existing.id },
    );
  }

  return { actions, notes };
}

/**
 * Computes the bulk role-position PATCH body needed to make `orderedNames` (top-to-bottom) match that order
 * in Discord, packed immediately below `botTopPosition`. Roles in `skipNames` (matched but above the bot, or
 * with no resolvable id) are left out of the PATCH entirely and reported back in `skipped`. Runs out of room
 * gracefully: if there isn't enough space between the bot's role and @everyone (position 0) for every managed
 * role, the excess roles are skipped rather than assigned colliding/invalid positions.
 */
export function computeRolePositions({ orderedNames, nameToId, skipNames = [], botTopPosition }) {
  const skipSet = new Set(skipNames);
  const positions = [];
  const skipped = [];
  let pos = botTopPosition - 1;

  for (const name of orderedNames) {
    if (skipSet.has(name)) {
      skipped.push(name);
      continue;
    }
    const id = nameToId[name];
    if (!id || pos < 1) {
      skipped.push(name);
      continue;
    }
    positions.push({ id, position: pos });
    pos -= 1;
  }

  return { positions, skipped };
}

// ---------------------------------------------------------------------------------------------------------
// Categories & channels
// ---------------------------------------------------------------------------------------------------------

/** Finds an existing category channel by exact name match. Categories have no `existingKey`/`existingName`. */
export function resolveCategoryTarget({ spec, existingChannels }) {
  return existingChannels.find((c) => c.type === ChannelType.GuildCategory && c.name === spec.name) ?? null;
}

/** Only a `position` change is possible for a category (name is assumed stable once created). */
export function computeCategoryPatch({ existing, position }) {
  const patch = {};
  if (existing.position !== position) patch.position = position;
  return { patch, hasChanges: Object.keys(patch).length > 0 };
}

/**
 * Finds the existing channel a plan channel spec refers to, in the priority order the operator described:
 * `existingKey` (looked up in `plan.existing.channels`) first, then `existingName` (exact match against any
 * current guild channel), then falling back to an exact match on the plan's own `name` field as a safety net
 * so a channel created by an earlier run is found on the next one even without an explicit existingKey/Name.
 */
export function resolveChannelTarget({ spec, existingChannels, existingIdMap }) {
  if (spec.existingKey) {
    const id = existingIdMap?.[spec.existingKey];
    if (id) {
      const found = existingChannels.find((c) => c.id === id);
      if (found) return found;
    }
  }
  if (spec.existingName) {
    const found = existingChannels.find((c) => c.name === spec.existingName);
    if (found) return found;
  }
  return existingChannels.find((c) => c.name === spec.name) ?? null;
}

/**
 * True when two channel names differ only in decoration (emoji prefixes, punctuation, casing, whitespace) —
 * e.g. `"rules"` vs `"📖 rules"`. Compares the alphanumeric/hyphen "core" of each name with everything else
 * stripped. Callers should only invoke this once they already know the two names differ.
 */
export function isTrivialRename(currentName, desiredName) {
  const normalize = (s) =>
    String(s ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9-]/gu, '');
  const a = normalize(currentName);
  const b = normalize(desiredName);
  return a.length > 0 && a === b;
}

/**
 * Computes the minimal PATCH payload to bring an existing channel's name/topic/slowmode/category/position/type
 * in line with the plan. Renames only happen when `isTrivialRename` says the difference is cosmetic — a
 * genuinely different name is left alone (with a note) rather than silently renamed out from under whoever's
 * using it. Type conversion is only ever attempted between text and announcement (the only pair Discord allows
 * to convert in place, and only on Community guilds) — anything else is left as-is with a note.
 */
export function computeChannelPatch({ existing, spec, categoryId, position, channelType }) {
  const patch = {};
  const notes = [];

  if (existing.name !== spec.name) {
    if (isTrivialRename(existing.name, spec.name)) {
      patch.name = spec.name;
    } else {
      notes.push(`#${existing.name}: plan name "${spec.name}" differs non-trivially — keeping existing name`);
    }
  }

  const desiredTopic = spec.topic ?? null;
  if (desiredTopic !== null && (existing.topic ?? null) !== desiredTopic) {
    patch.topic = desiredTopic;
  }

  if (spec.slowmode !== undefined && (existing.rate_limit_per_user ?? 0) !== spec.slowmode) {
    patch.rate_limit_per_user = spec.slowmode;
  }

  if ((existing.parent_id ?? null) !== categoryId) {
    patch.parent_id = categoryId;
  }

  if (existing.position !== position) {
    patch.position = position;
  }

  const desiredType = CHANNEL_TYPE_MAP[channelType];
  if (existing.type !== desiredType) {
    const isTextAnnouncementSwap =
      (existing.type === ChannelType.GuildText && desiredType === ChannelType.GuildAnnouncement) ||
      (existing.type === ChannelType.GuildAnnouncement && desiredType === ChannelType.GuildText);
    if (isTextAnnouncementSwap) {
      patch.type = desiredType;
    } else {
      notes.push(`#${existing.name}: existing type ${existing.type} can't safely convert to planned type ${desiredType} — leaving as-is`);
    }
  }

  return { patch, notes, hasChanges: Object.keys(patch).length > 0 };
}

/** Full creation payload for a channel that doesn't exist yet. */
export function computeChannelCreatePayload({ spec, categoryId, position, channelType }) {
  const payload = {
    name: spec.name,
    type: CHANNEL_TYPE_MAP[channelType],
    parent_id: categoryId,
    position,
  };
  if (spec.topic) payload.topic = spec.topic;
  if (spec.slowmode !== undefined) payload.rate_limit_per_user = spec.slowmode;
  return payload;
}

/**
 * Computes the merged permission-overwrite list for one channel from every source that can contribute to it:
 * `spec.everyone.deny`, `spec.roleOnly` (denies @everyone ViewChannel, allows the named roles ViewChannel +
 * SendMessages/Connect+Speak), `spec.boosterOnly` (denies @everyone ViewChannel, allows the booster role and
 * every staff role), `spec.botNeeds` (the bot's own member overwrite), the bot's always-on access for
 * `BOT_ALWAYS_VIEW_CHANNELS`, and the guild-wide Muted role deny list. Every source that targets the same
 * overwrite id (e.g. @everyone appearing in both `everyone.deny` and `roleOnly`) is merged into one overwrite
 * rather than producing duplicate/conflicting entries; if a permission somehow ends up in both allow and deny
 * for the same id, deny wins (fail closed). Returns `{ overwrites, notes }` — `overwrites` is ready to PUT one
 * at a time via `channelPermission(channelId, overwriteId)`, and `notes` explains anything that had to be
 * skipped (an unresolvable role name, a missing booster role, an unknown permission name).
 */
export function computeChannelOverwrites({
  spec,
  channelType,
  roleNameToId,
  everyoneId,
  mutedRoleId,
  mutedDenyList,
  botUserId,
  boosterRoleId,
}) {
  const notes = [];
  const entries = new Map();

  const ensure = (id, type) => {
    if (!entries.has(id)) entries.set(id, { type, allow: new Set(), deny: new Set() });
    return entries.get(id);
  };

  const talkPerms = channelType === 'voice' ? ['Connect', 'Speak'] : ['SendMessages'];

  if (spec.everyone?.deny?.length) {
    const e = ensure(everyoneId, ROLE_OVERWRITE_TYPE);
    for (const p of spec.everyone.deny) e.deny.add(p);
  }

  if (spec.roleOnly?.length) {
    const e = ensure(everyoneId, ROLE_OVERWRITE_TYPE);
    e.deny.add('ViewChannel');
    for (const roleName of spec.roleOnly) {
      const id = roleNameToId[roleName];
      if (!id) {
        notes.push(`#${spec.name}: roleOnly role "${roleName}" not found — skipped`);
        continue;
      }
      const r = ensure(id, ROLE_OVERWRITE_TYPE);
      r.allow.add('ViewChannel');
      for (const p of talkPerms) r.allow.add(p);
    }
  }

  if (spec.boosterOnly) {
    const e = ensure(everyoneId, ROLE_OVERWRITE_TYPE);
    e.deny.add('ViewChannel');
    if (boosterRoleId) {
      const b = ensure(boosterRoleId, ROLE_OVERWRITE_TYPE);
      b.allow.add('ViewChannel');
    } else {
      notes.push(`#${spec.name}: boosterOnly set but no premium-subscriber (booster) role exists in the guild — skipped for that role`);
    }
    for (const roleName of STAFF_ROLE_NAMES) {
      const id = roleNameToId[roleName];
      if (!id) continue;
      const r = ensure(id, ROLE_OVERWRITE_TYPE);
      r.allow.add('ViewChannel');
      for (const p of talkPerms) r.allow.add(p);
    }
  }

  if (spec.botNeeds?.length && botUserId) {
    const b = ensure(botUserId, MEMBER_OVERWRITE_TYPE);
    for (const p of spec.botNeeds) b.allow.add(p);
  }

  if (botUserId && BOT_ALWAYS_VIEW_CHANNELS.includes(spec.name)) {
    const b = ensure(botUserId, MEMBER_OVERWRITE_TYPE);
    for (const p of BOT_ALWAYS_PERMS) b.allow.add(p);
  }

  if (mutedRoleId && mutedDenyList?.length) {
    const m = ensure(mutedRoleId, ROLE_OVERWRITE_TYPE);
    for (const p of mutedDenyList) m.deny.add(p);
  }

  const overwrites = [];
  for (const [id, entry] of entries) {
    for (const p of entry.allow) {
      if (entry.deny.has(p)) entry.allow.delete(p); // deny wins on conflict (fail closed)
    }
    const { value: allowBits, unknown: unknownAllow } = permissionsToBitfield([...entry.allow]);
    const { value: denyBits, unknown: unknownDeny } = permissionsToBitfield([...entry.deny]);
    for (const name of [...unknownAllow, ...unknownDeny]) {
      notes.push(`#${spec.name}: unknown permission name "${name}" in an overwrite — ignored`);
    }
    if (allowBits === 0n && denyBits === 0n) continue;
    overwrites.push({ id, type: entry.type, allow: allowBits.toString(), deny: denyBits.toString() });
  }

  return { overwrites, notes };
}

// ---------------------------------------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------------------------------------

/**
 * Joins `lines` with `joiner` into as few messages as possible, each capped at `maxLen` characters (Discord's
 * 2000-char message limit by default). Never splits a single line across two messages unless that one line
 * alone exceeds `maxLen` (a defensive hard-split that shouldn't be hit by any real plan content).
 */
export function chunkMessage(lines, { maxLen = 2000, joiner = '\n\n' } = {}) {
  const full = lines.join(joiner);
  if (full.length <= maxLen) return [full];

  const chunks = [];
  let current = '';
  for (const line of lines) {
    const candidate = current.length === 0 ? line : current + joiner + line;
    if (candidate.length > maxLen) {
      if (current.length === 0) {
        for (let i = 0; i < line.length; i += maxLen) chunks.push(line.slice(i, i + maxLen));
      } else {
        chunks.push(current);
        current = line;
      }
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** True if any of `messages` (as returned by GET channel messages) was authored by the bot. */
export function hasBotPosted(messages, botUserId) {
  return (messages ?? []).some((m) => m?.author?.id === botUserId);
}
