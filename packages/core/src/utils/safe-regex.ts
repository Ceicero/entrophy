import safeRegex from 'safe-regex2';

const MAX_PATTERN_LENGTH = 256;
const ALLOWED_FLAGS = new Set(['g', 'i', 'm', 's', 'u']);

export interface ValidateUserRegexResult {
  ok: boolean;
  error?: string;
}

/**
 * Validates a user-supplied regex pattern before it's ever run against real content: length limit,
 * only safe flags, catastrophic-backtracking heuristic (`safe-regex2`), and that it actually compiles.
 */
export function validateUserRegex(pattern: string, flags = 'i'): ValidateUserRegexResult {
  if (typeof pattern !== 'string' || pattern.length === 0) {
    return { ok: false, error: 'Pattern must not be empty.' };
  }
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return { ok: false, error: `Pattern must be ${MAX_PATTERN_LENGTH} characters or fewer.` };
  }
  for (const flag of flags) {
    if (!ALLOWED_FLAGS.has(flag)) {
      return { ok: false, error: `Unsupported regex flag "${flag}". Allowed flags are g, i, m, s, u.` };
    }
  }
  if (!safeRegex(pattern)) {
    return { ok: false, error: 'Pattern is not safe (risk of catastrophic backtracking).' };
  }
  try {
    // compiled only to confirm it's valid
    const compiled = new RegExp(pattern, flags);
    void compiled;
  } catch (err) {
    return { ok: false, error: `Pattern failed to compile: ${err instanceof Error ? err.message : String(err)}` };
  }
  return { ok: true };
}

export interface SafeTestOptions {
  maxInputLength?: number;
}

/**
 * Tests `re` against `input`, truncating overly long input first (defends against slow matches on huge strings)
 * and always resetting `lastIndex` before/after, so stateful global/sticky regexes behave predictably across calls.
 */
export function safeTest(re: RegExp, input: string, options: SafeTestOptions = {}): boolean {
  const maxInputLength = options.maxInputLength ?? 2000;
  const truncated = input.length > maxInputLength ? input.slice(0, maxInputLength) : input;
  re.lastIndex = 0;
  const result = re.test(truncated);
  re.lastIndex = 0;
  return result;
}
