import { randomBytes, randomUUID } from 'node:crypto';

/** Generates a new random UUID (v4). */
export function newId(): string {
  return randomUUID();
}

const SHORT_ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Generates a short, lowercase-alphanumeric random id (default 10 chars). Not for secrets/tokens. */
export function shortId(length = 10): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += SHORT_ID_ALPHABET[bytes[i] % SHORT_ID_ALPHABET.length];
  }
  return out;
}
