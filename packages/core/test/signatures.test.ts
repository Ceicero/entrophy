import { createHmac, generateKeyPairSync, sign as edSign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  timingSafeEqualStr,
  verifyDiscordInteractionSignature,
  verifyGithubSignature,
  verifyHmacSha256,
  verifyStripeSignature,
  verifyTwitchEventSubSignature,
} from '../src/crypto/signatures';

describe('timingSafeEqualStr', () => {
  it('returns true only for identical strings and never throws on mismatched lengths', () => {
    expect(timingSafeEqualStr('abc', 'abc')).toBe(true);
    expect(timingSafeEqualStr('abc', 'abd')).toBe(false);
    expect(timingSafeEqualStr('abc', 'abcd')).toBe(false);
    expect(timingSafeEqualStr('', '')).toBe(true);
  });
});

describe('verifyHmacSha256', () => {
  it('verifies a correct signature and rejects a tampered payload', () => {
    const secret = 'shared-secret';
    const payload = JSON.stringify({ hello: 'world' });
    const sig = createHmac('sha256', secret).update(payload).digest('hex');

    expect(verifyHmacSha256(payload, secret, sig)).toBe(true);
    expect(verifyHmacSha256('tampered payload', secret, sig)).toBe(false);
    expect(verifyHmacSha256(payload, 'wrong-secret', sig)).toBe(false);
  });

  it('never throws on malformed input', () => {
    expect(verifyHmacSha256('payload', '', '')).toBe(false);
    // @ts-expect-error intentionally passing garbage to prove it doesn't throw
    expect(verifyHmacSha256(undefined, 'secret', 'not-hex-!!')).toBe(false);
  });
});

describe('verifyGithubSignature', () => {
  it('verifies the sha256= prefixed X-Hub-Signature-256 header', () => {
    const secret = 'gh-secret';
    const payload = '{"action":"opened"}';
    const header = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;

    expect(verifyGithubSignature(payload, secret, header)).toBe(true);
    expect(verifyGithubSignature(payload, secret, 'sha256=deadbeef')).toBe(false);
  });
});

describe('verifyStripeSignature', () => {
  const secret = 'whsec_test';
  const payload = '{"id":"evt_123"}';

  function makeHeader(timestampSec: number, body = payload): string {
    const signedPayload = `${timestampSec}.${body}`;
    const v1 = createHmac('sha256', secret).update(signedPayload).digest('hex');
    return `t=${timestampSec},v1=${v1}`;
  }

  it('accepts a signature within the tolerance window', () => {
    const header = makeHeader(Math.floor(Date.now() / 1000));
    expect(verifyStripeSignature(payload, header, secret)).toBe(true);
  });

  it('rejects a signature outside the tolerance window', () => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 3600;
    const header = makeHeader(oldTimestamp);
    expect(verifyStripeSignature(payload, header, secret, 300)).toBe(false);
    // But accepted with a wider tolerance:
    expect(verifyStripeSignature(payload, header, secret, 7200)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const header = makeHeader(Math.floor(Date.now() / 1000));
    expect(verifyStripeSignature('{"id":"evt_TAMPERED"}', header, secret)).toBe(false);
  });

  it('never throws on malformed headers', () => {
    expect(verifyStripeSignature(payload, 'garbage', secret)).toBe(false);
    expect(verifyStripeSignature(payload, '', secret)).toBe(false);
  });
});

describe('verifyTwitchEventSubSignature', () => {
  const secret = 'twitch-secret';
  const messageId = 'msg-1';
  const body = '{"subscription":{}}';

  function sign(timestamp: string): string {
    const message = messageId + timestamp + body;
    return `sha256=${createHmac('sha256', secret).update(message).digest('hex')}`;
  }

  it('accepts a valid signature within 10 minutes', () => {
    const timestamp = new Date().toISOString();
    const signatureHeader = sign(timestamp);
    expect(verifyTwitchEventSubSignature({ messageId, timestamp, body, secret, signatureHeader })).toBe(true);
  });

  it('rejects a stale timestamp beyond the 10-minute tolerance', () => {
    const timestamp = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const signatureHeader = sign(timestamp);
    expect(verifyTwitchEventSubSignature({ messageId, timestamp, body, secret, signatureHeader })).toBe(false);
  });

  it('rejects a wrong signature', () => {
    const timestamp = new Date().toISOString();
    expect(
      verifyTwitchEventSubSignature({ messageId, timestamp, body, secret, signatureHeader: 'sha256=bad' }),
    ).toBe(false);
  });
});

describe('verifyDiscordInteractionSignature', () => {
  it('verifies a real Ed25519 signature and rejects a tampered body', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' });
    // Strip the fixed 12-byte SPKI prefix to get the raw 32-byte Ed25519 public key.
    const publicKeyHex = publicKeyDer.subarray(12).toString('hex');

    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = '{"type":1}';
    const message = Buffer.concat([Buffer.from(timestamp, 'utf8'), Buffer.from(body, 'utf8')]);
    const signatureHex = edSign(null, message, privateKey).toString('hex');

    expect(verifyDiscordInteractionSignature(publicKeyHex, signatureHex, timestamp, body)).toBe(true);
    expect(verifyDiscordInteractionSignature(publicKeyHex, signatureHex, timestamp, '{"type":2}')).toBe(false);
    expect(verifyDiscordInteractionSignature(publicKeyHex, signatureHex, '9999999999', body)).toBe(false);
  });

  it('never throws on malformed keys/signatures', () => {
    expect(verifyDiscordInteractionSignature('not-hex', 'not-hex', '123', 'body')).toBe(false);
    expect(verifyDiscordInteractionSignature('', '', '', '')).toBe(false);
  });
});
