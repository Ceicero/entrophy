// Shared zod input schemas for the Twitch chat bot (routes/twitch-chat.ts). Kept in this small module
// rather than inline in the route file — unlike the rest of `routes/integrations.ts` (which declares its
// zod schemas inline per-route) — because the Discord `/twitch` command (packages/plugins/src/integrations/
// commands/twitch.ts) must validate identically to the API and can't import from `apps/api`; keeping these
// isolated here at least gives the routes a single place to import from, and documents the exact rules the
// command implementation has to mirror by hand.
import { z } from 'zod';
import { TWITCH_CHAT_LEVELS, TWITCH_CHAT_RESERVED_COMMAND_NAMES } from '@entrophy/types/integrations';

/** `/^[a-z0-9_]{1,32}$/`, stored lowercase — shared by command and timer names. */
export const twitchChatNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{1,32}$/, 'Must be 1-32 characters: lowercase letters, numbers, or underscore.');

/** Rejects the built-in command names (`!commands`, `!uptime`, `!title`) every channel already answers. */
export const twitchChatCommandNameSchema = twitchChatNameSchema.refine(
  (name) => !(TWITCH_CHAT_RESERVED_COMMAND_NAMES as readonly string[]).includes(name),
  (name) => ({ message: `"${name}" is a built-in command name and can't be overridden.` }),
);

export const twitchChatResponseSchema = z.string().trim().min(1).max(400);

export const twitchChatCooldownSecondsSchema = z.number().int().min(0).max(3600);

export const twitchChatLevelSchema = z.enum(TWITCH_CHAT_LEVELS);

export const twitchChatIntervalMinutesSchema = z.number().int().min(5).max(1440);

/** Exactly one printable, non-space, non-`/` character (so command matching stays unambiguous). */
export const twitchChatPrefixSchema = z
  .string()
  .length(1, 'Must be exactly one character.')
  .regex(/^[^\s/]$/, 'Must be a single printable character, not a space or "/".');

export const updateTwitchChatChannelSchema = z.object({
  enabled: z.boolean().optional(),
  commandPrefix: twitchChatPrefixSchema.optional(),
});

export const createTwitchChatCommandSchema = z.object({
  name: twitchChatCommandNameSchema,
  response: twitchChatResponseSchema,
  cooldownSeconds: twitchChatCooldownSecondsSchema.optional(),
  minLevel: twitchChatLevelSchema.optional(),
});

export const updateTwitchChatCommandSchema = z.object({
  name: twitchChatCommandNameSchema.optional(),
  response: twitchChatResponseSchema.optional(),
  cooldownSeconds: twitchChatCooldownSecondsSchema.optional(),
  minLevel: twitchChatLevelSchema.optional(),
  enabled: z.boolean().optional(),
});

export const createTwitchChatTimerSchema = z.object({
  name: twitchChatNameSchema,
  message: twitchChatResponseSchema,
  intervalMinutes: twitchChatIntervalMinutesSchema,
});

export const updateTwitchChatTimerSchema = z.object({
  name: twitchChatNameSchema.optional(),
  message: twitchChatResponseSchema.optional(),
  intervalMinutes: twitchChatIntervalMinutesSchema.optional(),
  enabled: z.boolean().optional(),
});

/** Per-channel limits enforced by the routes alongside these schemas (ARCHITECTURE.md §19/§J). */
export const TWITCH_CHAT_MAX_COMMANDS_PER_CHANNEL = 50;
export const TWITCH_CHAT_MAX_TIMERS_PER_CHANNEL = 10;
