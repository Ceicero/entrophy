import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../env';
import { ConfigError } from '../errors';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const FORMAT_VERSION = 'v1';

/** Format produced by `encryptSecret`: `v1:<iv b64>:<tag b64>:<ciphertext b64>`. */
export type EncryptedString = string;

// Lowercase-only: base64 alphabets routinely contain uppercase letters, so a case-insensitive
// hex test would misclassify some base64 strings (e.g. an all-zero-byte buffer's base64 form
// is 64 uppercase 'A's, which is also syntactically valid hex). Standard hex-encoding tools
// (`openssl rand -hex`, Node's `Buffer.toString('hex')`) emit lowercase, so this is unambiguous
// for real keys while still rejecting base64 strings that only coincidentally look hex-like.
const HEX_KEY_PATTERN = /^[0-9a-f]{64}$/;

/** Parses an `ENCRYPTION_KEY`-style value (32-byte base64, or 64-char lowercase hex) into a raw 32-byte key buffer. */
function parseKey(raw: string, sourceName: string): Buffer {
  const trimmed = raw.trim();
  const buf = HEX_KEY_PATTERN.test(trimmed) ? Buffer.from(trimmed, 'hex') : Buffer.from(trimmed, 'base64');
  if (buf.length !== KEY_LENGTH) {
    throw new ConfigError(
      `${sourceName} must decode to exactly ${KEY_LENGTH} bytes (got ${buf.length}). ` +
        `Generate one with generateEncryptionKey() or \`openssl rand -base64 32\`.`,
    );
  }
  return buf;
}

function resolveKey(explicit?: string): Buffer {
  const raw = explicit ?? env.ENCRYPTION_KEY;
  if (!raw) {
    throw new ConfigError(
      'ENCRYPTION_KEY is not set. Generate one with generateEncryptionKey() or `openssl rand -base64 32`.',
    );
  }
  return parseKey(raw, explicit ? 'the provided encryption key' : 'ENCRYPTION_KEY');
}

function resolvePreviousKey(): Buffer | undefined {
  if (!env.ENCRYPTION_KEY_PREVIOUS) return undefined;
  return parseKey(env.ENCRYPTION_KEY_PREVIOUS, 'ENCRYPTION_KEY_PREVIOUS');
}

function decryptWithKey(keyBuf: Buffer, iv: Buffer, tag: Buffer, ciphertext: Buffer): string {
  const decipher = createDecipheriv(ALGORITHM, keyBuf, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString('utf8');
}

/**
 * Encrypts `plain` with AES-256-GCM, returning `v1:<iv b64>:<tag b64>:<ciphertext b64>`.
 * Uses `key` if provided, else `env.ENCRYPTION_KEY`.
 */
export function encryptSecret(plain: string, key?: string): EncryptedString {
  const keyBuf = resolveKey(key);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, keyBuf, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [FORMAT_VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(
    ':',
  );
}

/**
 * Decrypts a value produced by `encryptSecret`. Uses `key` if provided, else `env.ENCRYPTION_KEY`,
 * falling back to `env.ENCRYPTION_KEY_PREVIOUS` (key-rotation support) when no explicit key was given
 * and the primary key fails to authenticate.
 */
export function decryptSecret(cipherText: string, key?: string): string {
  const parts = cipherText.split(':');
  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) {
    throw new ConfigError('Invalid encrypted value format.');
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(ctB64, 'base64');

  const primaryKey = resolveKey(key);
  try {
    return decryptWithKey(primaryKey, iv, tag, ciphertext);
  } catch (primaryErr) {
    if (!key) {
      const previousKey = resolvePreviousKey();
      if (previousKey) {
        try {
          return decryptWithKey(previousKey, iv, tag, ciphertext);
        } catch {
          // fall through to the error below
        }
      }
    }
    const cause = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
    throw new ConfigError(`Failed to decrypt value: authentication failed or key mismatch (${cause}).`);
  }
}

/** True if `str` looks like an `encryptSecret()` output (`v1:<b64>:<b64>:<b64>`). Does not verify authenticity. */
export function isEncrypted(str: string): boolean {
  const parts = str.split(':');
  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) return false;
  return parts.slice(1).every((part) => part.length > 0 && /^[A-Za-z0-9+/]+=*$/.test(part));
}

/** Generates a new random 32-byte AES-256 key, base64-encoded, suitable for `ENCRYPTION_KEY`. */
export function generateEncryptionKey(): string {
  return randomBytes(KEY_LENGTH).toString('base64');
}
