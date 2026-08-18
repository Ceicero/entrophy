import { describe, expect, it } from 'vitest';
import { describeFastifyClientError, isFastifyRateLimitError } from '../src/lib/fastify-errors';
import { buildTestApp, loginAs, seedUserGuilds } from './helpers/build-test-app';

const GUILD_ID = '666666666666666666';
const USER_ID = '777777777777777777';

async function authedApp() {
  const { app, redis } = await buildTestApp({
    guild: { findUnique: async () => ({ id: GUILD_ID, botPresent: true }) },
  });
  const { cookieHeader, session } = await loginAs(app, redis, { userId: USER_ID });
  await seedUserGuilds(redis, USER_ID, [{ id: GUILD_ID, owner: true, permissions: '8' }]);
  const mutHeaders = {
    cookie: cookieHeader,
    origin: 'http://localhost:3000',
    'x-csrf-token': session.csrfToken,
  };
  return { app, mutHeaders };
}

describe('error handler', () => {
  it('never leaks a stack trace or the raw error message for an unexpected (500) failure', async () => {
    const boom = new Error('super secret internal detail: postgres://user:pass@host/db');
    const { app, redis } = await buildTestApp({
      guild: { findUnique: async () => ({ id: GUILD_ID, botPresent: true }) },
      pluginState: {
        findMany: async () => {
          throw boom;
        },
      },
    });
    const { cookieHeader } = await loginAs(app, redis, { userId: USER_ID });
    await seedUserGuilds(redis, USER_ID, [{ id: GUILD_ID, owner: true, permissions: '8' }]);

    const res = await app.inject({
      method: 'GET',
      url: `/guilds/${GUILD_ID}/plugins`,
      headers: { cookie: cookieHeader },
    });

    expect(res.statusCode).toBe(500);
    const text = res.body;
    expect(text).not.toContain('postgres://');
    expect(text).not.toContain('super secret');
    expect(text).not.toMatch(/at\s+\S+\s+\(.*:\d+:\d+\)/); // no stack-trace-looking lines

    const body = res.json();
    expect(body).toEqual({ error: { code: 'internal_error', message: 'An unexpected error occurred.' } });

    await app.close();
  });

  it('returns a clean 404 for an unknown route', async () => {
    const { app } = await buildTestApp();

    const res = await app.inject({ method: 'GET', url: '/this-route-does-not-exist' });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');

    await app.close();
  });

  describe("Fastify's own FST_ERR_* client errors keep their 4xx status", () => {
    it('PATCH with content-type application/json and an empty body → 400 empty_body', async () => {
      const { app, mutHeaders } = await authedApp();

      const res = await app.inject({
        method: 'PATCH',
        url: `/guilds/${GUILD_ID}/config`,
        headers: { ...mutHeaders, 'content-type': 'application/json' },
        payload: '',
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({
        error: { code: 'empty_body', message: 'Request body must not be empty.' },
      });

      await app.close();
    });

    it('PATCH with a malformed JSON body → 400 invalid_json (no parser message echoed)', async () => {
      const { app, mutHeaders } = await authedApp();

      const res = await app.inject({
        method: 'PATCH',
        url: `/guilds/${GUILD_ID}/config`,
        headers: { ...mutHeaders, 'content-type': 'application/json' },
        payload: '{not json',
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({
        error: { code: 'invalid_json', message: 'Request body is not valid JSON.' },
      });
      expect(res.body).not.toContain('Unexpected token');

      await app.close();
    });

    // Fastify ships a default `text/plain` parser, so that content type parses fine and fails zod validation
    // instead (400). A media type with no registered parser is what exercises the 415 branch.
    it('PATCH with an unregistered content-type (application/xml) → 415 unsupported_media_type', async () => {
      const { app, mutHeaders } = await authedApp();

      const res = await app.inject({
        method: 'PATCH',
        url: `/guilds/${GUILD_ID}/config`,
        headers: { ...mutHeaders, 'content-type': 'application/xml' },
        payload: '<config/>',
      });

      expect(res.statusCode).toBe(415);
      expect(res.json()).toEqual({
        error: { code: 'unsupported_media_type', message: 'Unsupported Content-Type.' },
      });

      await app.close();
    });
  });

  describe('describeFastifyClientError', () => {
    it('maps known content-type-parser codes to their fixed public messages', () => {
      expect(describeFastifyClientError('FST_ERR_CTP_EMPTY_JSON_BODY', 400)).toEqual({
        code: 'empty_body',
        message: 'Request body must not be empty.',
      });
      expect(describeFastifyClientError('FST_ERR_CTP_BODY_TOO_LARGE', 413)).toEqual({
        code: 'payload_too_large',
        message: 'Request body is too large.',
      });
      expect(describeFastifyClientError('FST_ERR_NOT_FOUND', 404)).toEqual({
        code: 'not_found',
        message: 'Not found.',
      });
    });

    it('falls back to a generic bad_request for any other FST_ERR_* 4xx code (never echoes internals)', () => {
      expect(describeFastifyClientError('FST_ERR_SOMETHING_NEW', 400)).toEqual({
        code: 'bad_request',
        message: 'Bad request.',
      });
    });
  });

  describe('isFastifyRateLimitError', () => {
    it('recognises the plain statusCode-429 error @fastify/rate-limit throws and nothing else', () => {
      expect(isFastifyRateLimitError({ statusCode: 429 })).toBe(true);
      expect(isFastifyRateLimitError({ code: 'FST_ERR_X', statusCode: 429 })).toBe(false);
      expect(isFastifyRateLimitError({ statusCode: 500 })).toBe(false);
      expect(isFastifyRateLimitError({})).toBe(false);
    });
  });
});
