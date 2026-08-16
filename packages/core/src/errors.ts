import { ZodError } from 'zod';

export interface AppErrorOptions {
  status?: number;
  details?: unknown;
  expose?: boolean;
}

/** Base application error carrying a stable error code, HTTP status, and whether it's safe to show to end users. */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  readonly expose: boolean;

  constructor(code: string, message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = options.status ?? 500;
    this.details = options.details;
    this.expose = options.expose ?? this.status < 500;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 400 — request payload failed validation. */
export class ValidationError extends AppError {
  constructor(message = 'Validation failed.', details?: unknown) {
    super('validation_error', message, { status: 400, details, expose: true });
    this.name = 'ValidationError';
  }
}

/** 403 — actor lacks the staff level, Discord permission, or ownership required for this action. */
export class PermissionError extends AppError {
  constructor(message = 'You do not have permission to do this.', details?: unknown) {
    super('permission_denied', message, { status: 403, details, expose: true });
    this.name = 'PermissionError';
  }
}

/** 404 — the requested resource does not exist (or is not visible to the actor). */
export class NotFoundError extends AppError {
  constructor(message = 'Not found.', details?: unknown) {
    super('not_found', message, { status: 404, details, expose: true });
    this.name = 'NotFoundError';
  }
}

/** 429 — actor has exceeded a rate limit or cooldown. */
export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded.', details?: unknown) {
    super('rate_limited', message, { status: 429, details, expose: true });
    this.name = 'RateLimitError';
  }
}

/** 500 — the process is missing required configuration (env vars, secrets, etc). Never exposed to end users. */
export class ConfigError extends AppError {
  constructor(message: string, details?: unknown) {
    super('config_error', message, { status: 500, details, expose: false });
    this.name = 'ConfigError';
  }
}

/** 502 — a call to an external service (Discord API, integration provider, etc) failed. */
export class ExternalServiceError extends AppError {
  constructor(message = 'An external service failed.', details?: unknown) {
    super('external_service_error', message, { status: 502, details, expose: false });
    this.name = 'ExternalServiceError';
  }
}

/** Type guard: true if `err` is an AppError (or subclass). */
export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

export interface PublicError {
  status: number;
  body: {
    error: {
      code: string;
      message: string;
      details?: unknown;
    };
  };
}

/**
 * Converts any thrown value into a safe, client-facing error response.
 * Never leaks stack traces, and only includes `details`/the real message when the error opted in via `expose`.
 */
export function toPublicError(err: unknown): PublicError {
  if (err instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: {
          code: 'validation_error',
          message: 'Validation failed.',
          details: {
            issues: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
          },
        },
      },
    };
  }

  if (isAppError(err)) {
    return {
      status: err.status,
      body: {
        error: {
          code: err.code,
          message: err.expose ? err.message : 'An unexpected error occurred.',
          ...(err.expose && err.details !== undefined ? { details: err.details } : {}),
        },
      },
    };
  }

  return {
    status: 500,
    body: { error: { code: 'internal_error', message: 'An unexpected error occurred.' } },
  };
}
