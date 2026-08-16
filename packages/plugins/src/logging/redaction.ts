import { validateUserRegex } from '@entrophy/core';

export interface RedactionPattern {
  name: string;
  regex: RegExp;
}

/**
 * Default redaction rules (SPEC.md §D / ARCHITECTURE.md's logging task: emails, phone numbers, Discord tokens,
 * credit-card-like numbers, IPv4 addresses). Applied to every stored/displayed log payload regardless of guild
 * config; admins can additionally configure their own patterns (`config.redactionPatterns`, validated with
 * `validateUserRegex` at save time in the `/logs redact add` command and the API route).
 */
export const DEFAULT_REDACTION_PATTERNS: RedactionPattern[] = [
  { name: 'email', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  // Loose international-ish phone matcher: optional leading +CC, then 3-3-4 or similar digit groupings.
  { name: 'phone', regex: /(?:\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g },
  // Discord bot/user tokens: base64url id segment, base64url timestamp segment, base64url HMAC segment.
  { name: 'discord_token', regex: /\b[A-Za-z\d_-]{23,28}\.[A-Za-z\d_-]{6,7}\.[A-Za-z\d_-]{27,40}\b/g },
  // Visa/Mastercard/Amex/Discover-shaped digit runs, optionally grouped with spaces or dashes. The separator
  // only ever appears *between* digits (never trailing) so the match can't swallow a following space/word.
  { name: 'credit_card', regex: /\b\d(?:[ -]?\d){12,18}\b/g },
  {
    name: 'ipv4',
    regex: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
  },
];

function placeholderFor(name: string): string {
  return `[redacted:${name}]`;
}

/**
 * Compiles a guild's custom redaction pattern strings into `RedactionPattern`s, skipping any that fail
 * `validateUserRegex` (defense in depth — patterns are already validated when saved via `/logs redact add` or
 * the dashboard/API, but config can in principle be edited elsewhere) and naming them `custom1`, `custom2`, ...
 * in the order given.
 */
export function compileCustomPatterns(patterns: string[]): RedactionPattern[] {
  const out: RedactionPattern[] = [];
  patterns.forEach((pattern, index) => {
    const check = validateUserRegex(pattern);
    if (!check.ok) return;
    try {
      out.push({ name: `custom${index + 1}`, regex: new RegExp(pattern, 'gi') });
    } catch {
      // validateUserRegex already confirmed this compiles; unreachable in practice, but never let a bad
      // pattern crash the logging pipeline.
    }
  });
  return out;
}

function allPatterns(customPatterns: string[]): RedactionPattern[] {
  return [...DEFAULT_REDACTION_PATTERNS, ...compileCustomPatterns(customPatterns)];
}

/** Replaces every match of every default + custom pattern in `text` with a `[redacted:<name>]` placeholder. */
export function redactText(text: string, customPatterns: string[] = []): string {
  let result = text;
  for (const { name, regex } of allPatterns(customPatterns)) {
    regex.lastIndex = 0;
    result = result.replace(regex, placeholderFor(name));
  }
  return result;
}

export interface RedactionTestMatch {
  name: string;
  matched: boolean;
}

export interface RedactionTestResult {
  redacted: string;
  matches: RedactionTestMatch[];
}

/** Runs every default + custom pattern against `text`, returning the redacted text and which patterns fired — used by `/logs redact list`'s live preview, the dashboard test box, and `POST .../redaction/test`. */
export function testRedactionPatterns(text: string, customPatterns: string[] = []): RedactionTestResult {
  const patterns = allPatterns(customPatterns);
  const matches: RedactionTestMatch[] = [];
  let redacted = text;

  for (const { name, regex } of patterns) {
    regex.lastIndex = 0;
    const matched = regex.test(text);
    matches.push({ name, matched });
    regex.lastIndex = 0;
    redacted = redacted.replace(regex, placeholderFor(name));
  }

  return { redacted, matches };
}
