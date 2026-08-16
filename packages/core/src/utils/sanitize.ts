/** Escapes Discord markdown special characters so user input renders as literal text, not formatting. */
export function escapeMarkdown(input: string): string {
  return input.replace(/([\\*_~`|>{}[\]()#+\-.!])/g, '\\$1');
}

/** Escapes HTML special characters for safe embedding in generated HTML (e.g. ticket transcripts). */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// eslint-disable-next-line no-control-regex -- intentionally stripping control characters from filenames
const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|\x00-\x1f]/g;

/** Sanitizes a string for safe use as a filename: strips path separators, control chars, and reserved characters. */
export function sanitizeFilename(input: string, maxLength = 200): string {
  const cleaned = input.replace(UNSAFE_FILENAME_CHARS, '_').replace(/^\.+/, '_').trim();
  const safe = cleaned.length === 0 ? 'file' : cleaned;
  return safe.length > maxLength ? safe.slice(0, maxLength) : safe;
}

/** Truncates `str` to at most `max` characters, appending an ellipsis when it had to cut. */
export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  if (max <= 1) return str.slice(0, max);
  return `${str.slice(0, max - 1)}…`;
}

const MENTION_PATTERN = /<@[!&]?\d+>|@everyone|@here/g;

/** Strips Discord user/role mentions and @everyone/@here from a string, replacing them with a neutral placeholder. */
export function stripMentions(input: string): string {
  return input.replace(MENTION_PATTERN, '[mention]');
}

/** Sanitizes text for safe inclusion in a Discord embed field: strips mentions, then truncates (default 1024 chars). */
export function sanitizeEmbedText(input: string, max = 1024): string {
  return truncate(stripMentions(input), max);
}
