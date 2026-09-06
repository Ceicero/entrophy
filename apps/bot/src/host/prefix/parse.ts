/** Parses prefix-command messages (message-based alternative to slash commands). */

export interface ParsedPrefixCommand {
  name: string;
  tokens: string[];
}

/**
 * Tokenizes a message, respecting double quotes and handling escaped quotes.
 * Splits on unquoted whitespace; `"quoted phrase"` becomes a single token,
 * and backslash-escapes are resolved.
 */
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '\\' && i + 1 < input.length && input[i + 1] === '"') {
        // Escaped quote inside quoted string: consume both characters, add the literal quote
        current += '"';
        i += 2;
      } else if (ch === '"') {
        // End of quoted string
        inQuotes = false;
        i += 1;
      } else {
        current += ch;
        i += 1;
      }
    } else {
      if (ch === '"') {
        // Start of quoted string
        inQuotes = true;
        i += 1;
      } else if (/\s/.test(ch)) {
        // Whitespace outside quotes: delimiter
        if (current) tokens.push(current);
        current = '';
        i += 1;
      } else {
        current += ch;
        i += 1;
      }
    }
  }

  // Finalize any remaining token
  if (current) tokens.push(current);

  return tokens;
}

/**
 * Determines if a message is a bare prefix (just the prefix with optional whitespace).
 * Examples: "+", "+  ", "+\t"
 * Returns true only if the message is exactly the prefix optionally followed by whitespace.
 */
export function isBarePrefix(content: string, prefix: string): boolean {
  if (!content.startsWith(prefix)) {
    return false;
  }
  const remainder = content.slice(prefix.length);
  return /^\s*$/.test(remainder);
}

/**
 * Parses a message for a prefix command.
 *
 * Rules:
 * - Return null if content doesn't start with `prefix`.
 * - Return null if the remainder is empty/whitespace.
 * - Return null if the character right after the prefix is not a letter (stops `++`, `+1`, `+_+`).
 * - Command name = first token, lowercased.
 * - Remaining tokens are returned as-is (may contain `key:value` pairs, handled by `resolvePrefixOptions`).
 */
export function parsePrefixMessage(content: string, prefix: string): ParsedPrefixCommand | null {
  if (!content.startsWith(prefix)) {
    return null;
  }

  const remainder = content.slice(prefix.length);
  if (!remainder || /^\s*$/.test(remainder)) {
    return null;
  }

  // First non-whitespace character must be a letter to avoid matching `++`, `+1`, emoticons, etc.
  const firstNonWhitespace = remainder.trimStart()[0];
  if (!firstNonWhitespace || !/[a-zA-Z]/.test(firstNonWhitespace)) {
    return null;
  }

  const tokens = tokenize(remainder.trimStart());
  if (tokens.length === 0) {
    return null;
  }

  const name = tokens[0].toLowerCase();
  const rest = tokens.slice(1);

  return { name, tokens: rest };
}

/**
 * Splits a token of the form `key:value` into its components.
 * Matches `^([a-z][a-z0-9_-]*):(.*)$` (case-insensitive).
 * Returns null if the token doesn't match this pattern.
 */
export function splitNamedArg(token: string): { key: string; value: string } | null {
  const match = token.match(/^([a-z][a-z0-9_-]*):(.*)$/i);
  if (!match) return null;

  return {
    key: match[1].toLowerCase(),
    value: match[2],
  };
}
