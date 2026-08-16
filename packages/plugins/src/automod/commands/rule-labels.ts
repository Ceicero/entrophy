import type { AutomodRuleTypeValue } from '../schemas';

/** Human-friendly labels for `AutomodRuleType`, used in slash command choices and embeds. */
export const RULE_TYPE_LABELS: Record<AutomodRuleTypeValue, string> = {
  MESSAGE_FREQUENCY: 'Message frequency (spam)',
  DUPLICATE_MESSAGES: 'Duplicate messages',
  MENTION_SPAM: 'Mention spam',
  INVITE_LINKS: 'Invite links',
  SCAM_LINKS: 'Scam / phishing links',
  REGEX_FILTER: 'Regex filter',
  WORD_FILTER: 'Word filter',
  CAPS: 'Excessive caps',
  REPEATED_CHARS: 'Repeated characters',
  ATTACHMENTS: 'Attachments',
  NSFW_ENFORCEMENT: 'NSFW channel enforcement',
  ACCOUNT_AGE: 'New account age',
  RAID_DETECTION: 'Raid detection',
};

/** Human-friendly labels for the per-rule action types. */
export const ACTION_TYPE_LABELS: Record<string, string> = {
  warn: 'Warn',
  delete: 'Delete message',
  timeout: 'Timeout',
  quarantine: 'Quarantine',
  alert_staff: 'Alert staff',
  ignore: 'Log only (ignore)',
};
