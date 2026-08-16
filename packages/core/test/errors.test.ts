import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  AppError,
  ConfigError,
  NotFoundError,
  PermissionError,
  RateLimitError,
  ValidationError,
  isAppError,
  toPublicError,
} from '../src/errors';

describe('AppError subclasses', () => {
  it('default to sensible status codes and expose flags', () => {
    expect(new ValidationError().status).toBe(400);
    expect(new PermissionError().status).toBe(403);
    expect(new NotFoundError().status).toBe(404);
    expect(new RateLimitError().status).toBe(429);
    expect(new ConfigError('missing').status).toBe(500);

    expect(new ValidationError().expose).toBe(true);
    expect(new ConfigError('missing').expose).toBe(false);
  });

  it('isAppError narrows correctly', () => {
    expect(isAppError(new ValidationError())).toBe(true);
    expect(isAppError(new Error('plain'))).toBe(false);
    expect(isAppError('not an error')).toBe(false);
  });
});

describe('toPublicError', () => {
  it('exposes message/details for client (4xx) errors', () => {
    const result = toPublicError(new PermissionError('nope', { requiredLevel: 'admin' }));
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('permission_denied');
    expect(result.body.error.message).toBe('nope');
    expect(result.body.error.details).toEqual({ requiredLevel: 'admin' });
  });

  it('hides the real message/details for non-exposed (5xx) errors', () => {
    const result = toPublicError(new ConfigError('DATABASE_URL missing', { secret: 'leak-me-not' }));
    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe('config_error');
    expect(result.body.error.message).not.toContain('DATABASE_URL');
    expect(result.body.error).not.toHaveProperty('details');
  });

  it('maps zod errors to a 400 validation_error with path+message issues only', () => {
    const schema = z.object({ name: z.string().min(1) });
    const parsed = schema.safeParse({ name: '' });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const result = toPublicError(parsed.error);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('validation_error');
    const details = result.body.error.details as { issues: { path: string; message: string }[] };
    expect(details.issues[0]).toEqual({ path: 'name', message: expect.any(String) });
  });

  it('treats unknown thrown values as a generic 500 without leaking their contents', () => {
    const result = toPublicError('some random string thrown');
    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe('internal_error');
  });

  it('never includes a stack trace in the public body', () => {
    const err = new AppError('boom', 'Something exploded', { status: 500 });
    const result = toPublicError(err);
    const serialized = JSON.stringify(result.body);
    expect(serialized).not.toContain('at ');
    expect(result.body.error).not.toHaveProperty('stack');
  });
});
