import { describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers/build-test-app';

describe('zod request validation', () => {
  it('returns a 400 validation_error shape with per-field issues for a bad body', async () => {
    const { app } = await buildTestApp();

    const res = await app.inject({
      method: 'PATCH',
      url: '/guilds/123456789012345678/config',
      payload: { fastActions: 'not-a-boolean', timezone: 123 },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('validation_error');
    expect(typeof body.error.message).toBe('string');
    expect(Array.isArray(body.error.details.issues)).toBe(true);
    expect(body.error.details.issues.length).toBeGreaterThan(0);

    await app.close();
  });

  it('returns a 400 for a malformed guild id in the route params', async () => {
    const { app } = await buildTestApp();

    const res = await app.inject({ method: 'GET', url: '/guilds/not-a-snowflake/plugins' });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('validation_error');

    await app.close();
  });
});
