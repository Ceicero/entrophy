export type PurgeValidationResult = { ok: true; count: number } | { ok: false; error: string };

/** Validates a requested `/mod purge` count against Discord's 1-100 bulk-delete window and the guild's configured max. */
export function validatePurgeCount(requested: number, purgeMax: number): PurgeValidationResult {
  if (!Number.isInteger(requested)) {
    return { ok: false, error: 'Purge count must be a whole number.' };
  }
  if (requested < 1 || requested > 100) {
    return { ok: false, error: 'Purge count must be between 1 and 100 (Discord bulk-delete limit).' };
  }
  if (requested > purgeMax) {
    return {
      ok: false,
      error: `This server's configured purge limit is ${purgeMax}. Lower the count or raise the limit in settings.`,
    };
  }
  return { ok: true, count: requested };
}

export interface PurgeCandidateMessage {
  id: string;
  authorId: string;
  authorIsBot?: boolean;
  content?: string;
  /** Discord only allows bulk-deleting messages younger than 14 days. */
  ageMs: number;
}

export interface PurgeFilterOptions {
  userId?: string;
  /** Only offered/applied when the guild has the MessageContent intent enabled — undefined otherwise. */
  contains?: string;
  limit: number;
}

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Pure selection logic for `/mod purge`: filters candidate messages by bulk-delete age eligibility, optional
 * author, and optional case-insensitive content substring, then takes at most `limit`. Kept separate from any
 * discord.js `Collection`/fetch call so it's unit-testable without a live gateway connection.
 */
export function filterMessagesForPurge(
  messages: PurgeCandidateMessage[],
  options: PurgeFilterOptions,
): PurgeCandidateMessage[] {
  const filtered = messages.filter((message) => {
    if (message.ageMs >= FOURTEEN_DAYS_MS) return false;
    if (options.userId && message.authorId !== options.userId) return false;
    if (options.contains && !(message.content ?? '').toLowerCase().includes(options.contains.toLowerCase()))
      return false;
    return true;
  });
  return filtered.slice(0, options.limit);
}
