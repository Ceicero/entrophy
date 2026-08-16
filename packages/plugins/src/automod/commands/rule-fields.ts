// Drives the "modal for type-specific fields" step of `/automod rule create` and `/automod rule edit` (TASK).
// One small declarative field list per `AutomodRuleType`, so the modal builder/parser stays generic instead of
// needing 13 near-duplicate command files.
import { ValidationError } from '@entrophy/core';
import { automodRuleConfigSchema, type AutomodRuleConfig, type AutomodRuleTypeValue } from '../schemas';

export interface RuleFieldSpec {
  /** Modal `TextInputBuilder` custom id — also the key merged into the parsed config object. */
  id: string;
  label: string;
  style: 'short' | 'paragraph';
  required: boolean;
  placeholder?: string;
  maxLength?: number;
  /** Stringifies the current/default value of this field from an existing config, for modal prefill. */
  stringify: (config: Record<string, unknown>) => string;
  /** Parses the raw modal input into the field's config value. Throws `ValidationError` on bad input. */
  parse: (raw: string) => unknown;
}

function parseIntInRange(raw: string, label: string, min: number, max: number): number {
  const trimmed = raw.trim();
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new ValidationError(`${label} must be a whole number.`);
  }
  if (n < min || n > max) {
    throw new ValidationError(`${label} must be between ${min} and ${max}.`);
  }
  return n;
}

function parseOptionalIntInRange(raw: string, label: string, min: number, max: number): number | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  return parseIntInRange(trimmed, label, min, max);
}

function parseBool(raw: string, fallback: boolean): boolean {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0) return fallback;
  if (['true', 'yes', 'on', '1'].includes(trimmed)) return true;
  if (['false', 'no', 'off', '0'].includes(trimmed)) return false;
  throw new ValidationError('Expected "true" or "false".');
}

function parseCsv(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function intField(id: string, label: string, min: number, max: number, fallback: number): RuleFieldSpec {
  return {
    id,
    label,
    style: 'short',
    required: false,
    placeholder: `Number, ${min}-${max} (default ${fallback})`,
    maxLength: 10,
    stringify: (config) => String((config[id] as number | undefined) ?? fallback),
    parse: (raw) => (raw.trim().length === 0 ? fallback : parseIntInRange(raw, label, min, max)),
  };
}

function optionalIntField(id: string, label: string, min: number, max: number): RuleFieldSpec {
  return {
    id,
    label,
    style: 'short',
    required: false,
    placeholder: `Number, ${min}-${max} (leave blank for no limit)`,
    maxLength: 10,
    stringify: (config) => {
      const v = config[id] as number | undefined;
      return v === undefined || v === null ? '' : String(v);
    },
    parse: (raw) => parseOptionalIntInRange(raw, label, min, max),
  };
}

function boolField(id: string, label: string, fallback: boolean): RuleFieldSpec {
  return {
    id,
    label,
    style: 'short',
    required: false,
    placeholder: `true or false (default ${fallback})`,
    maxLength: 5,
    stringify: (config) => String((config[id] as boolean | undefined) ?? fallback),
    parse: (raw) => parseBool(raw, fallback),
  };
}

function csvField(id: string, label: string, opts: { required?: boolean; placeholder?: string } = {}): RuleFieldSpec {
  return {
    id,
    label,
    style: 'paragraph',
    required: opts.required ?? false,
    placeholder: opts.placeholder ?? 'Comma-separated list',
    maxLength: 1000,
    stringify: (config) => {
      const v = config[id] as string[] | undefined;
      return Array.isArray(v) ? v.join(', ') : '';
    },
    parse: (raw) => parseCsv(raw),
  };
}

function textField(id: string, label: string, opts: { required?: boolean; maxLength?: number; placeholder?: string } = {}): RuleFieldSpec {
  return {
    id,
    label,
    style: 'short',
    required: opts.required ?? true,
    placeholder: opts.placeholder,
    maxLength: opts.maxLength ?? 256,
    stringify: (config) => String((config[id] as string | undefined) ?? ''),
    // A blank optional field (e.g. REGEX_FILTER's `flags`) must come through as `undefined`, not `''`, so the
    // schema's `.default(...)` actually applies — zod only fills a default for a genuinely-missing value.
    parse: (raw) => {
      const trimmed = raw.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    },
  };
}

/** Per-rule-type modal field lists (max 5 per Discord modal — every entry here stays at or under that). */
export const RULE_FIELD_SPECS: Record<AutomodRuleTypeValue, RuleFieldSpec[]> = {
  MESSAGE_FREQUENCY: [intField('maxMessages', 'Max messages', 1, 50, 5), intField('windowSeconds', 'Window (seconds)', 1, 300, 10)],
  DUPLICATE_MESSAGES: [intField('maxDuplicates', 'Max duplicates', 2, 20, 3), intField('windowSeconds', 'Window (seconds)', 1, 600, 60)],
  MENTION_SPAM: [intField('maxMentions', 'Max mentions', 1, 50, 5), boolField('includeRoleMentions', 'Count role mentions too', true)],
  INVITE_LINKS: [boolField('allowOwnServerInvites', 'Allow this server\'s own invites', true), csvField('allowedInviteCodes', 'Additional allowed invite codes')],
  SCAM_LINKS: [boolField('useBuiltInList', 'Use the built-in scam/phishing list', true), csvField('blockedDomains', 'Additional blocked domains')],
  REGEX_FILTER: [
    textField('pattern', 'Regex pattern', { required: true, maxLength: 256, placeholder: 'e.g. \\bfree\\s?nitro\\b' }),
    textField('flags', 'Regex flags', { required: false, maxLength: 5, placeholder: 'i (default)' }),
  ],
  WORD_FILTER: [
    csvField('words', 'Words/phrases (comma-separated)', { required: true }),
    boolField('wholeWord', 'Whole-word match only', true),
    boolField('caseSensitive', 'Case sensitive', false),
  ],
  CAPS: [intField('minLength', 'Minimum message length to check', 1, 2000, 10), intField('maxCapsPercent', 'Max uppercase %', 1, 100, 70)],
  REPEATED_CHARS: [intField('maxRepeats', 'Max repeated characters in a row', 2, 50, 6)],
  ATTACHMENTS: [
    csvField('blockedExtensions', 'Blocked file extensions (comma-separated)', { placeholder: 'exe, bat, scr, msi, jar, cmd' }),
    optionalIntField('maxAttachments', 'Max attachments per message', 0, 20),
  ],
  NSFW_ENFORCEMENT: [csvField('requireNsfwChannelForKeywords', 'Keywords requiring an NSFW channel', { required: true })],
  ACCOUNT_AGE: [intField('minAccountAgeHours', 'Minimum account age (hours)', 0, 24 * 365, 24)],
  RAID_DETECTION: [intField('joinBurstCount', 'Joins to trigger', 2, 200, 10), intField('joinBurstWindowSeconds', 'Within (seconds)', 1, 3600, 30)],
};

/** Parses raw modal field values into a validated `AutomodRuleConfig` for `type`. Throws `ValidationError` (with a user-facing message) on bad input, including the catastrophic-regex safety check for `REGEX_FILTER`. */
export function parseRuleFieldValues(type: AutomodRuleTypeValue, raw: Record<string, string>): AutomodRuleConfig {
  const specs = RULE_FIELD_SPECS[type];
  const parsed: Record<string, unknown> = { type };
  for (const spec of specs) {
    parsed[spec.id] = spec.parse(raw[spec.id] ?? '');
  }

  const result = automodRuleConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new ValidationError(result.error.issues.map((i) => i.message).join(' '));
  }
  return result.data;
}
