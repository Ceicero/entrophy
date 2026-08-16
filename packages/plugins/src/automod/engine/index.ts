import type { PrivilegedIntent } from '../../sdk';
import type { AutomodRuleConfig, AutomodRuleTypeValue } from '../schemas';
import { evaluateAccountAge } from './evaluators/account-age';
import { evaluateAttachments } from './evaluators/attachments';
import { evaluateCaps } from './evaluators/caps';
import { evaluateDuplicateMessages } from './evaluators/duplicate-messages';
import { evaluateInviteLinks } from './evaluators/invite-links';
import { evaluateMentionSpam } from './evaluators/mention-spam';
import { evaluateMessageFrequency } from './evaluators/message-frequency';
import { evaluateNsfwEnforcement } from './evaluators/nsfw-enforcement';
import { evaluateRaidDetection } from './evaluators/raid-detection';
import { evaluateRegexFilter } from './evaluators/regex-filter';
import { evaluateRepeatedChars } from './evaluators/repeated-chars';
import { evaluateScamLinks } from './evaluators/scam-links';
import { evaluateWordFilter } from './evaluators/word-filter';
import {
  NO_MATCH,
  type EvaluatorResult,
  type JoinEvaluator,
  type JoinEvaluatorInput,
  type MessageEvaluator,
  type MessageEvaluatorInput,
  type NormalizedMessage,
} from './types';
import { MemoryWindowStore } from './window-store';

export * from './types';
export { RedisWindowStore, MemoryWindowStore, scopedWindowStore } from './window-store';
export { DEFAULT_SCAM_DOMAINS, DEFAULT_SCAM_KEYWORD_PATTERNS } from './scam-list';

/** Rule types evaluated against a single message (`messageCreate`/`messageUpdate`). */
export const MESSAGE_RULE_TYPES = [
  'MESSAGE_FREQUENCY',
  'DUPLICATE_MESSAGES',
  'MENTION_SPAM',
  'INVITE_LINKS',
  'SCAM_LINKS',
  'REGEX_FILTER',
  'WORD_FILTER',
  'CAPS',
  'REPEATED_CHARS',
  'ATTACHMENTS',
  'NSFW_ENFORCEMENT',
] as const satisfies readonly AutomodRuleTypeValue[];

/** Rule types evaluated against a guild member join (`guildMemberAdd`). */
export const JOIN_RULE_TYPES = ['ACCOUNT_AGE', 'RAID_DETECTION'] as const satisfies readonly AutomodRuleTypeValue[];

const MESSAGE_EVALUATORS: Record<(typeof MESSAGE_RULE_TYPES)[number], MessageEvaluator<never>> = {
  MESSAGE_FREQUENCY: evaluateMessageFrequency,
  DUPLICATE_MESSAGES: evaluateDuplicateMessages,
  MENTION_SPAM: evaluateMentionSpam,
  INVITE_LINKS: evaluateInviteLinks,
  SCAM_LINKS: evaluateScamLinks,
  REGEX_FILTER: evaluateRegexFilter,
  WORD_FILTER: evaluateWordFilter,
  CAPS: evaluateCaps,
  REPEATED_CHARS: evaluateRepeatedChars,
  ATTACHMENTS: evaluateAttachments,
  NSFW_ENFORCEMENT: evaluateNsfwEnforcement,
};

const JOIN_EVALUATORS: Record<(typeof JOIN_RULE_TYPES)[number], JoinEvaluator<never>> = {
  ACCOUNT_AGE: evaluateAccountAge,
  RAID_DETECTION: evaluateRaidDetection,
};

/** Privileged intent (if any) a given `AutomodRuleType`'s evaluator needs to produce meaningful results (TASK spec). */
export const RULE_TYPE_REQUIRED_INTENTS: Record<AutomodRuleTypeValue, PrivilegedIntent | null> = {
  MESSAGE_FREQUENCY: null,
  DUPLICATE_MESSAGES: 'MessageContent',
  MENTION_SPAM: null,
  INVITE_LINKS: 'MessageContent',
  SCAM_LINKS: 'MessageContent',
  REGEX_FILTER: 'MessageContent',
  WORD_FILTER: 'MessageContent',
  CAPS: 'MessageContent',
  REPEATED_CHARS: 'MessageContent',
  ATTACHMENTS: 'MessageContent',
  NSFW_ENFORCEMENT: null,
  ACCOUNT_AGE: 'GuildMembers',
  RAID_DETECTION: 'GuildMembers',
};

export interface IntentsEnabledLike {
  messageContent: boolean;
  guildMembers: boolean;
  guildPresences: boolean;
}

/** True if `type`'s evaluator can produce meaningful matches given the guild's currently-enabled privileged intents. */
export function isRuleTypeActive(type: AutomodRuleTypeValue, intentsEnabled: IntentsEnabledLike): boolean {
  const required = RULE_TYPE_REQUIRED_INTENTS[type];
  if (!required) return true;
  if (required === 'MessageContent') return intentsEnabled.messageContent;
  if (required === 'GuildMembers') return intentsEnabled.guildMembers;
  return intentsEnabled.guildPresences;
}

/** True if `type` is evaluated against messages (`messageCreate`); false if it's a join-based rule. */
export function isMessageRuleType(type: AutomodRuleTypeValue): boolean {
  return (MESSAGE_RULE_TYPES as readonly string[]).includes(type);
}

/**
 * Runs the evaluator for `config.type` against a normalized message. Returns `NO_MATCH` (never throws) for a
 * join-only rule type passed here by mistake — callers should route by `isMessageRuleType` first; this defensive
 * fallback exists so a caller bug degrades to "did nothing" rather than crashing the message-handling pipeline.
 */
export async function evaluateMessageRule(
  config: AutomodRuleConfig,
  input: MessageEvaluatorInput,
): Promise<EvaluatorResult> {
  const evaluator = MESSAGE_EVALUATORS[config.type as keyof typeof MESSAGE_EVALUATORS];
  if (!evaluator) return NO_MATCH;
  // Each evaluator is declared against its own narrow config type; the dispatch table necessarily erases that to
  // a common shape (mirrors the SDK's own `PluginEventHandler<any>[]` erasure for the same reason — see
  // sdk/types.ts) and `config.type` has already been matched to `evaluator` via the object key above.
  return evaluator(input, config as never);
}

/** Same as `evaluateMessageRule`, for join-based rule types (`ACCOUNT_AGE`, `RAID_DETECTION`). */
export async function evaluateJoinRule(config: AutomodRuleConfig, input: JoinEvaluatorInput): Promise<EvaluatorResult> {
  const evaluator = JOIN_EVALUATORS[config.type as keyof typeof JOIN_EVALUATORS];
  if (!evaluator) return NO_MATCH;
  return evaluator(input, config as never);
}

/**
 * Runs a rule's evaluator against synthetic sample text, with a fresh in-memory window (TASK: "`/automod rule
 * test <rule> <text>` — runs the evaluator on sample text — dry"; used by both the command and the API's
 * `POST rules/:id/test`). Join-based rule types (`ACCOUNT_AGE`, `RAID_DETECTION`) can't be tested this way since
 * they evaluate member joins, not message text.
 */
export async function testRuleWithText(
  config: AutomodRuleConfig,
  sampleText: string,
  overrides: Partial<Omit<NormalizedMessage, 'content'>> = {},
): Promise<EvaluatorResult> {
  if (!isMessageRuleType(config.type)) {
    return {
      matched: false,
      reason: 'This rule type evaluates member joins (not message text), so it cannot be tested with sample text.',
    };
  }

  const message: NormalizedMessage = {
    guildId: overrides.guildId ?? 'test-guild',
    channelId: overrides.channelId ?? 'test-channel',
    messageId: overrides.messageId ?? `test-${Date.now()}`,
    authorId: overrides.authorId ?? 'test-user',
    authorBot: overrides.authorBot ?? false,
    content: sampleText,
    userMentionCount: overrides.userMentionCount ?? (sampleText.match(/<@!?\d+>/g)?.length ?? 0),
    roleMentionCount: overrides.roleMentionCount ?? (sampleText.match(/<@&\d+>/g)?.length ?? 0),
    everyoneMentioned: overrides.everyoneMentioned ?? /@(everyone|here)\b/.test(sampleText),
    attachments: overrides.attachments ?? [],
    channelNsfw: overrides.channelNsfw ?? false,
    createdAt: new Date(),
  };

  return evaluateMessageRule(config, { message, windowStore: new MemoryWindowStore() });
}
