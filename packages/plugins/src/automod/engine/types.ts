// Threshold semantics — the one place the convention is written down, because the two families genuinely differ
// and every evaluator, modal label and match reason has to agree with it:
//
//   * "N or more" (fires AT the number): MENTION_SPAM, DUPLICATE_MESSAGES, CAPS, REPEATED_CHARS, RAID_DETECTION.
//     The configured number is the point at which the behaviour becomes a violation, so hitting it exactly
//     flags. Their modal labels read "... to flag" and their reasons say "flags at N or more".
//   * "more than N" (fires ABOVE the number): MESSAGE_FREQUENCY and ATTACHMENTS' maxAttachments. The number is
//     an allowance a member may use in full, so only exceeding it flags. Labels read "Max ... allowed" and
//     reasons say "flags above N".
//   * ACCOUNT_AGE's minAccountAgeHours is a floor, not a ceiling: an account exactly that old is let through.
//
// Both readings are deliberate and pinned by __tests__/evaluators.test.ts, and rules already live in guilds were
// configured against them — so the comparisons must not be "harmonised" into one. What has to stay true is that
// the wording a moderator reads always says which one applies, so a "5" never means two different things.
import type { AutomodRuleConfig } from '../schemas';

/**
 * A minimal, discord.js-free view of a Discord message, so evaluators are pure and unit-testable
 * without a gateway connection (ARCHITECTURE.md §7's plugin SDK contract; TASK "Rule engine MUST be
 * pure and unit-tested"). Built by `../normalize.ts` from a real `discord.js` `Message`.
 */
export interface NormalizedMessage {
  guildId: string;
  channelId: string;
  messageId: string;
  authorId: string;
  authorBot: boolean;
  /** Empty string when the Message Content intent is not enabled — content-dependent evaluators must not be run in that case (see `RULE_TYPE_REQUIRED_INTENTS`). */
  content: string;
  userMentionCount: number;
  roleMentionCount: number;
  everyoneMentioned: boolean;
  attachments: { filename: string; contentType?: string | null }[];
  channelNsfw: boolean;
  createdAt: Date;
}

/** A minimal, discord.js-free view of a guild member join, for `ACCOUNT_AGE` / `RAID_DETECTION`. */
export interface NormalizedJoin {
  guildId: string;
  userId: string;
  userBot: boolean;
  accountCreatedAt: Date;
  joinedAt: Date;
}

export interface EvaluatorEvidence {
  [key: string]: string | number | boolean | null | undefined;
}

export interface EvaluatorResult {
  matched: boolean;
  reason?: string;
  /** 0-1. Only evaluators with a genuinely probabilistic signal set this; always labelled assistive-only downstream (SPEC.md §C). */
  riskScore?: number;
  evidence?: EvaluatorEvidence;
}

export const NO_MATCH: EvaluatorResult = { matched: false };

/**
 * Storage the frequency/duplicate/mention/raid evaluators need to look across multiple messages/joins over a
 * time window. One Redis-backed implementation for real use, one in-memory implementation for tests
 * (TASK: "a WindowStore interface (Redis-backed impl ... in-memory impl for tests)").
 */
export interface WindowStore {
  /** Appends `value` to the window at `key`, drops entries older than `windowMs`, and returns the resulting count. */
  pushAndCount(key: string, value: string, nowMs: number, windowMs: number): Promise<number>;
  /** Returns the values currently in the window at `key` (already pruned to `windowMs`), without adding anything. */
  peek(key: string, nowMs: number, windowMs: number): Promise<string[]>;
}

export interface MessageEvaluatorInput {
  message: NormalizedMessage;
  windowStore: WindowStore;
}

export interface JoinEvaluatorInput {
  join: NormalizedJoin;
  windowStore: WindowStore;
}

export type MessageEvaluator<Config extends AutomodRuleConfig = AutomodRuleConfig> = (
  input: MessageEvaluatorInput,
  config: Config,
) => Promise<EvaluatorResult>;

export type JoinEvaluator<Config extends AutomodRuleConfig = AutomodRuleConfig> = (
  input: JoinEvaluatorInput,
  config: Config,
) => Promise<EvaluatorResult>;
