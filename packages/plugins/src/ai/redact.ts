// Best-effort redaction applied to any text before it leaves the process for an AI provider (SPEC.md §K:
// "Content redaction before provider calls where possible"). This is a defense-in-depth heuristic, not a
// guarantee — the system prompt's <data> delimiters (see prompt.ts) are the real trust boundary.

const MENTION_PATTERN = /<@[!&]?\d+>|@everyone|@here/g;
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+/g;
// Matches common phone formats: optional country code, then 3-3-4 or similar groupings with separators.
const PHONE_PATTERN = /(?:\+\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const URL_PATTERN = /https?:\/\/([a-zA-Z0-9.-]+(?::\d+)?)(?:\/[^\s<>()]*)?/gi;
// Heuristic for API keys/tokens/secrets: long runs (>=20 chars) of base62-ish characters, optionally with a
// recognizable provider prefix (OpenAI `sk-`, GitHub `ghp_`/`gho_`, Slack `xox*-`, generic `Bearer <token>`),
// or any 32+ char hex/base64-ish run that looks machine-generated rather than a normal word.
const PREFIXED_TOKEN_PATTERN = /\b(?:sk-[A-Za-z0-9]{10,}|sk-ant-[A-Za-z0-9-]{10,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._-]{10,}\b/gi;
const LONG_OPAQUE_TOKEN_PATTERN = /\b(?=[A-Za-z0-9_-]{24,}\b)(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{24,}\b/g;

/** Replaces Discord user/role/channel mentions and @everyone/@here with a neutral placeholder. */
export function redactMentions(text: string): string {
  return text.replace(MENTION_PATTERN, '@user');
}

/** Replaces email addresses with a placeholder. */
export function redactEmails(text: string): string {
  return text.replace(EMAIL_PATTERN, '[email]');
}

/** Replaces phone-number-shaped substrings with a placeholder. */
export function redactPhoneNumbers(text: string): string {
  return text.replace(PHONE_PATTERN, '[phone]');
}

/** Replaces full URLs with `[link: <domain>]`, keeping the domain (useful context) but dropping the path/query. */
export function redactUrls(text: string): string {
  return text.replace(URL_PATTERN, (_match, domain: string) => `[link: ${domain}]`);
}

/** Replaces strings that look like API keys/tokens/secrets with a placeholder. */
export function redactTokens(text: string): string {
  return text
    .replace(BEARER_TOKEN_PATTERN, 'Bearer [redacted-token]')
    .replace(PREFIXED_TOKEN_PATTERN, '[redacted-token]')
    .replace(LONG_OPAQUE_TOKEN_PATTERN, '[redacted-token]');
}

/**
 * Applies every redaction pass, in an order chosen so later passes don't fight earlier ones (mentions/emails/URLs
 * first, since their syntax is unambiguous; the opaque-token heuristic last, since it's the broadest match).
 */
export function redact(text: string): string {
  let out = text;
  out = redactMentions(out);
  out = redactEmails(out);
  out = redactUrls(out);
  out = redactPhoneNumbers(out);
  out = redactTokens(out);
  return out;
}
