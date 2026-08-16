// Pure, unit-tested: Discord text-channel/thread names must be lowercase, <=100 chars, and (in practice, since
// Discord silently normalizes anyway) free of anything but letters/digits/dashes/underscores once we're building
// the name ourselves — this keeps `ticket-<n>-<username>` predictable and collision-free-ish across usernames.

const DIACRITICS_PATTERN = /[̀-ͯ]/g;
const UNSAFE_CHANNEL_CHARS = /[^a-z0-9_-]+/g;
const COLLAPSE_DASHES = /-{2,}/g;

/** Sanitizes an arbitrary string into a Discord-channel-name-safe fragment: lowercase, ASCII, dashes for spaces. */
export function sanitizeChannelNameFragment(input: string): string {
  const normalized = input
    .normalize('NFKD')
    .replace(DIACRITICS_PATTERN, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(UNSAFE_CHANNEL_CHARS, '')
    .replace(COLLAPSE_DASHES, '-')
    .replace(/^-+|-+$/g, '');
  return normalized;
}

/** Builds a `ticket-<number>-<sanitized-username>` channel/thread name, truncated to Discord's 100-char limit. */
export function ticketChannelName(number: number, username: string): string {
  const prefix = `ticket-${number}-`;
  const fragment = sanitizeChannelNameFragment(username) || 'user';
  const maxFragmentLen = Math.max(1, 100 - prefix.length);
  return `${prefix}${fragment.slice(0, maxFragmentLen)}`;
}
