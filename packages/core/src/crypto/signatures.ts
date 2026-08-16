import { createHmac, createPublicKey, timingSafeEqual, verify as edVerify } from 'node:crypto';

/** Constant-time string comparison. Returns `false` (never throws) on any error or length mismatch. */
export function timingSafeEqualStr(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export interface VerifyHmacOptions {
  /** A literal prefix on the signature header to strip before comparing, e.g. `'sha256='`. */
  prefix?: string;
}

/** Verifies an HMAC-SHA256 hex signature over `payload`. Never throws on malformed input. */
export function verifyHmacSha256(payload: string | Buffer, secret: string, signatureHex: string, options: VerifyHmacOptions = {}): boolean {
  try {
    if (!secret || !signatureHex) return false;
    let sig = signatureHex.trim();
    if (options.prefix && sig.startsWith(options.prefix)) {
      sig = sig.slice(options.prefix.length);
    }
    if (!/^[0-9a-fA-F]+$/.test(sig)) return false;
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    return timingSafeEqualStr(sig.toLowerCase(), expected.toLowerCase());
  } catch {
    return false;
  }
}

/** Verifies a GitHub webhook `X-Hub-Signature-256` header (`sha256=<hex>`). */
export function verifyGithubSignature(payload: string | Buffer, secret: string, signatureHeader: string): boolean {
  return verifyHmacSha256(payload, secret, signatureHeader, { prefix: 'sha256=' });
}

/**
 * Verifies a Stripe `Stripe-Signature` header (`t=<unix>,v1=<hex>[,v1=<hex>...]`), rejecting signatures
 * whose timestamp is outside `toleranceSec` of now (replay protection).
 */
export function verifyStripeSignature(
  payload: string | Buffer,
  stripeSignatureHeader: string,
  secret: string,
  toleranceSec = 300,
): boolean {
  try {
    if (!stripeSignatureHeader || !secret) return false;
    let timestamp: string | undefined;
    const v1Signatures: string[] = [];
    for (const part of stripeSignatureHeader.split(',')) {
      const [key, value] = part.trim().split('=', 2);
      if (key === 't' && value) timestamp = value;
      else if (key === 'v1' && value) v1Signatures.push(value);
    }
    if (!timestamp || v1Signatures.length === 0) return false;

    const tsNum = Number(timestamp);
    if (!Number.isFinite(tsNum)) return false;
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - tsNum) > toleranceSec) return false;

    const bodyStr = payload instanceof Buffer ? payload.toString('utf8') : payload;
    const signedPayload = `${timestamp}.${bodyStr}`;
    const expected = createHmac('sha256', secret).update(signedPayload).digest('hex');
    return v1Signatures.some((sig) => /^[0-9a-fA-F]+$/.test(sig) && timingSafeEqualStr(sig.toLowerCase(), expected.toLowerCase()));
  } catch {
    return false;
  }
}

export interface VerifyTwitchEventSubOptions {
  messageId: string;
  timestamp: string;
  body: string | Buffer;
  secret: string;
  /** The `Twitch-Eventsub-Message-Signature` header value, e.g. `sha256=<hex>`. */
  signatureHeader: string;
}

/**
 * Verifies a Twitch EventSub notification signature: `sha256=` + HMAC-SHA256(secret, messageId + timestamp + body),
 * rejecting timestamps older than 10 minutes.
 */
export function verifyTwitchEventSubSignature(options: VerifyTwitchEventSubOptions): boolean {
  try {
    const { messageId, timestamp, body, secret, signatureHeader } = options;
    if (!messageId || !timestamp || !secret || !signatureHeader) return false;

    const tsMs = Date.parse(timestamp);
    if (!Number.isFinite(tsMs)) return false;
    const toleranceMs = 10 * 60 * 1000;
    if (Math.abs(Date.now() - tsMs) > toleranceMs) return false;

    const bodyStr = body instanceof Buffer ? body.toString('utf8') : body;
    const message = messageId + timestamp + bodyStr;
    const expected = `sha256=${createHmac('sha256', secret).update(message).digest('hex')}`;
    return timingSafeEqualStr(signatureHeader.trim().toLowerCase(), expected.toLowerCase());
  } catch {
    return false;
  }
}

// DER/SPKI prefix that precedes a raw 32-byte Ed25519 public key.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/**
 * Verifies a Discord interaction Ed25519 signature over `timestamp + rawBody`, using the application's
 * public key (hex, as shown in the Discord Developer Portal).
 */
export function verifyDiscordInteractionSignature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  rawBody: string | Buffer,
): boolean {
  try {
    if (!publicKeyHex || !signatureHex || !timestamp) return false;
    if (!/^[0-9a-fA-F]{64}$/.test(publicKeyHex)) return false;
    if (!/^[0-9a-fA-F]{128}$/.test(signatureHex)) return false;

    const publicKeyBytes = Buffer.from(publicKeyHex, 'hex');
    const spki = Buffer.concat([ED25519_SPKI_PREFIX, publicKeyBytes]);
    const publicKey = createPublicKey({ key: spki, format: 'der', type: 'spki' });

    const bodyBuf: Buffer = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
    const message = Buffer.concat([Buffer.from(timestamp, 'utf8'), bodyBuf]);
    const signature = Buffer.from(signatureHex, 'hex');

    return edVerify(null, message, publicKey, signature);
  } catch {
    return false;
  }
}
