import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, generateEncryptionKey, isEncrypted } from '../src/crypto/encryption';

describe('encryption', () => {
  it('round-trips plaintext through encrypt/decrypt with an explicit key', () => {
    const key = generateEncryptionKey();
    const plain = 'super secret oauth token';
    const cipherText = encryptSecret(plain, key);

    expect(cipherText.startsWith('v1:')).toBe(true);
    expect(cipherText.split(':')).toHaveLength(4);
    expect(decryptSecret(cipherText, key)).toBe(plain);
  });

  it('round-trips using the default env.ENCRYPTION_KEY when no key is passed', () => {
    const plain = 'value encrypted with the env key';
    const cipherText = encryptSecret(plain);
    expect(decryptSecret(cipherText)).toBe(plain);
  });

  it('accepts a 64-char hex key in addition to base64', () => {
    const hexKey = 'a'.repeat(64);
    const plain = 'hex key round trip';
    const cipherText = encryptSecret(plain, hexKey);
    expect(decryptSecret(cipherText, hexKey)).toBe(plain);
  });

  it('detects tampering (auth tag mismatch) and throws instead of returning corrupted plaintext', () => {
    const key = generateEncryptionKey();
    const cipherText = encryptSecret('do not tamper with me', key);
    const [version, iv, tag, ct] = cipherText.split(':');
    // Flip the ciphertext without touching the tag, so GCM auth fails.
    const tamperedCt = ct.slice(0, -2) + (ct.slice(-2) === 'AA' ? 'BB' : 'AA');
    const tampered = [version, iv, tag, tamperedCt].join(':');

    expect(() => decryptSecret(tampered, key)).toThrow();
  });

  it('rejects an obviously wrong decryption key', () => {
    const key = generateEncryptionKey();
    const wrongKey = generateEncryptionKey();
    const cipherText = encryptSecret('secret', key);
    expect(() => decryptSecret(cipherText, wrongKey)).toThrow();
  });

  it('falls back to ENCRYPTION_KEY_PREVIOUS when the primary env key cannot decrypt', () => {
    // process.env.ENCRYPTION_KEY_PREVIOUS is seeded in test/setup.ts and picked up by the core `env` singleton.
    const previousKey = process.env.ENCRYPTION_KEY_PREVIOUS;
    expect(previousKey).toBeDefined();

    const cipherText = encryptSecret('encrypted under the old (rotated-out) key', previousKey);
    // No explicit key passed: primary env.ENCRYPTION_KEY will fail auth, then ENCRYPTION_KEY_PREVIOUS should succeed.
    expect(decryptSecret(cipherText)).toBe('encrypted under the old (rotated-out) key');
  });

  it('rejects keys that do not decode to exactly 32 bytes', () => {
    expect(() => encryptSecret('x', Buffer.from('too short').toString('base64'))).toThrow();
    expect(() => encryptSecret('x', Buffer.alloc(48).toString('base64'))).toThrow();
  });

  it('rejects a malformed cipher text format', () => {
    const key = generateEncryptionKey();
    expect(() => decryptSecret('not-the-right-format', key)).toThrow();
    expect(() => decryptSecret('v2:a:b:c', key)).toThrow();
  });

  it('isEncrypted recognizes encryptSecret output and rejects plain strings', () => {
    const key = generateEncryptionKey();
    const cipherText = encryptSecret('hello', key);
    expect(isEncrypted(cipherText)).toBe(true);
    expect(isEncrypted('hello')).toBe(false);
    expect(isEncrypted('v1:only:two')).toBe(false);
  });

  it('generateEncryptionKey produces a valid 32-byte base64 key each time', () => {
    const a = generateEncryptionKey();
    const b = generateEncryptionKey();
    expect(Buffer.from(a, 'base64')).toHaveLength(32);
    expect(a).not.toBe(b);
  });
});
