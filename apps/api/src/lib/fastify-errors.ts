/**
 * Public shape for Fastify's own client errors (`FST_ERR_*` with a 4xx `statusCode` — content-type parser
 * failures, etc.). These are plain `FastifyError`s, not `AppError`s, so `toPublicError` would otherwise report
 * them as 500 `internal_error`. The table is fixed so no internal message ever leaks; unknown 4xx codes fall
 * back to a generic `bad_request`.
 */
export interface PublicClientError {
  code: string;
  message: string;
}

const FASTIFY_CLIENT_ERRORS: Readonly<Record<string, PublicClientError>> = {
  FST_ERR_CTP_EMPTY_JSON_BODY: { code: 'empty_body', message: 'Request body must not be empty.' },
  FST_ERR_CTP_INVALID_JSON_BODY: { code: 'invalid_json', message: 'Request body is not valid JSON.' },
  FST_ERR_CTP_INVALID_MEDIA_TYPE: { code: 'unsupported_media_type', message: 'Unsupported Content-Type.' },
  FST_ERR_CTP_BODY_TOO_LARGE: { code: 'payload_too_large', message: 'Request body is too large.' },
  FST_ERR_CTP_INVALID_CONTENT_LENGTH: {
    code: 'invalid_content_length',
    message: 'Invalid Content-Length header.',
  },
  // Parity with the app's `setNotFoundHandler`.
  FST_ERR_NOT_FOUND: { code: 'not_found', message: 'Not found.' },
};

const FALLBACK: PublicClientError = { code: 'bad_request', message: 'Bad request.' };

/** Maps a Fastify `FST_ERR_*` code (with its 4xx `statusCode`) to a stable public `{ code, message }`. Never echoes the original message. */
export function describeFastifyClientError(fastifyCode: string, _statusCode: number): PublicClientError {
  return FASTIFY_CLIENT_ERRORS[fastifyCode] ?? FALLBACK;
}

/**
 * True for the error `@fastify/rate-limit` throws when a client exceeds its quota: a plain `Error` with
 * `statusCode` 429 and no `code`. It isn't an `AppError` either, so without this it would surface as a 500.
 */
export function isFastifyRateLimitError(err: { code?: unknown; statusCode?: unknown }): boolean {
  return err.code === undefined && err.statusCode === 429;
}
