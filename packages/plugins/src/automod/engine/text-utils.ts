// Small, dependency-free text helpers shared by the content-dependent evaluators. Kept separate from the
// evaluators themselves so each evaluator file stays focused on its one rule's matching logic.

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+/gi;
const INVITE_PATTERN = /(?:discord\.gg|discord(?:app)?\.com\/invite)\/([\w-]{2,32})/gi;

/** Extracts every `http(s)://` URL's hostname (lowercased, no port) found in `content`. Malformed URLs are skipped. */
export function extractLinkHostnames(content: string): string[] {
  const hostnames: string[] = [];
  for (const match of content.matchAll(URL_PATTERN)) {
    try {
      hostnames.push(new URL(match[0]).hostname.toLowerCase());
    } catch {
      // Not a valid URL despite matching the loose pattern (e.g. trailing punctuation edge case) — skip it.
    }
  }
  return hostnames;
}

/** Extracts every Discord invite code (`discord.gg/<code>`, `discord.com/invite/<code>`) found in `content`. */
export function extractInviteCodes(content: string): string[] {
  const codes: string[] = [];
  for (const match of content.matchAll(INVITE_PATTERN)) {
    if (match[1]) codes.push(match[1]);
  }
  return codes;
}

/** Escapes regex metacharacters so a literal word/phrase can be safely embedded in a constructed `RegExp`. */
export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Deterministic, non-cryptographic 32-bit hash (FNV-1a) of normalized text — used to key duplicate-content windows without storing raw message content in Redis. */
export function hashNormalizedText(input: string): string {
  const normalized = input.trim().toLowerCase().replace(/\s+/g, ' ');
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
