import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { encryptSecret, env } from '@entrophy/core';
import { buildTestApp } from './helpers/build-test-app';

const GITHUB_SECRET = 'github-endpoint-secret';
const GENERIC_SECRET = 'generic-endpoint-secret';

function githubSignature(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

function stripeSignature(secret: string, body: string, timestamp: number): string {
  const signedPayload = `${timestamp}.${body}`;
  const v1 = createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

function genericSignature(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

function endpointOverrides(secretPlain: string) {
  return {
    webhookEndpoint: {
      findFirst: async () => ({
        id: 'endpoint-1',
        guildId: '888888888888888888',
        direction: 'INBOUND',
        enabled: true,
        deletedAt: null,
        secretEnc: encryptSecret(secretPlain),
      }),
      update: async () => ({}),
    },
  };
}

describe('webhook signature verification', () => {
  it('accepts a validly-signed GitHub delivery and enqueues it', async () => {
    const { app, queues } = await buildTestApp(endpointOverrides(GITHUB_SECRET));
    const body = JSON.stringify({ action: 'opened' });

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/github/endpoint-1',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': githubSignature(GITHUB_SECRET, body),
        'x-github-delivery': 'delivery-1',
        'x-github-event': 'issues',
      },
      payload: body,
    });

    expect(res.statusCode).toBe(202);
    expect(queues.calls).toHaveLength(1);
    expect(queues.calls[0]).toMatchObject({ queue: 'integrations.inbound', name: 'github' });
    expect(queues.calls[0].data).toMatchObject({ provider: 'github', eventType: 'issues' });

    await app.close();
  });

  it('rejects a GitHub delivery with an invalid signature', async () => {
    const { app, queues } = await buildTestApp(endpointOverrides(GITHUB_SECRET));
    const body = JSON.stringify({ action: 'opened' });

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/github/endpoint-1',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': 'sha256=0000000000000000000000000000000000000000000000000000000000000000',
        'x-github-delivery': 'delivery-2',
        'x-github-event': 'issues',
      },
      payload: body,
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('invalid_signature');
    expect(queues.calls).toHaveLength(0);

    await app.close();
  });

  it('accepts a validly-signed Stripe event and enqueues it', async () => {
    const { app, queues } = await buildTestApp();
    const body = JSON.stringify({ id: 'evt_123', type: 'checkout.session.completed' });
    const now = Math.floor(Date.now() / 1000);

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': stripeSignature(env.STRIPE_WEBHOOK_SECRET!, body, now),
      },
      payload: body,
    });

    expect(res.statusCode).toBe(202);
    expect(queues.calls).toHaveLength(1);
    expect(queues.calls[0]).toMatchObject({ queue: 'integrations.inbound', name: 'stripe' });

    await app.close();
  });

  it('rejects a Stripe event with an invalid signature', async () => {
    const { app, queues } = await buildTestApp();
    const body = JSON.stringify({ id: 'evt_456', type: 'checkout.session.completed' });

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=deadbeef' },
      payload: body,
    });

    expect(res.statusCode).toBe(401);
    expect(queues.calls).toHaveLength(0);

    await app.close();
  });

  it('accepts a validly-signed generic webhook and enqueues it', async () => {
    const { app, queues } = await buildTestApp(endpointOverrides(GENERIC_SECRET));
    const body = JSON.stringify({ hello: 'world' });

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/generic/endpoint-1',
      headers: {
        'content-type': 'application/json',
        'x-entrophy-signature': genericSignature(GENERIC_SECRET, body),
        'x-entrophy-event-type': 'test.event',
      },
      payload: body,
    });

    expect(res.statusCode).toBe(202);
    expect(queues.calls).toHaveLength(1);
    expect(queues.calls[0]).toMatchObject({ queue: 'integrations.inbound', name: 'generic' });

    await app.close();
  });

  it('rejects a generic webhook with an invalid signature', async () => {
    const { app, queues } = await buildTestApp(endpointOverrides(GENERIC_SECRET));
    const body = JSON.stringify({ hello: 'world' });

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/generic/endpoint-1',
      headers: { 'content-type': 'application/json', 'x-entrophy-signature': 'not-a-valid-signature' },
      payload: body,
    });

    expect(res.statusCode).toBe(401);
    expect(queues.calls).toHaveLength(0);

    await app.close();
  });

  it('returns 404 for an unknown webhook endpoint id', async () => {
    const { app } = await buildTestApp({ webhookEndpoint: { findFirst: async () => null } });
    const body = JSON.stringify({ hello: 'world' });

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/generic/does-not-exist',
      headers: { 'content-type': 'application/json', 'x-entrophy-signature': 'anything' },
      payload: body,
    });

    expect(res.statusCode).toBe(404);

    await app.close();
  });
});
