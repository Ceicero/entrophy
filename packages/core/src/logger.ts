import pino, { type Logger, type LoggerOptions } from 'pino';
import { env, isProduction } from './env';

const REDACT_PATHS = [
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.password',
  '*.secret',
  '*.authorization',
  'req.headers.authorization',
  'req.headers.cookie',
  '*.content',
  '*.messageContent',
  '*.apiKey',
];

const usePretty = !isProduction && Boolean(process.stdout.isTTY);

const options: LoggerOptions = {
  level: env.LOG_LEVEL,
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  ...(usePretty
    ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } } }
    : {}),
};

/** Root process logger. Redacts tokens/secrets/message content; pretty-printed only in non-production TTYs. */
export const logger: Logger = pino(options);

/** Returns a child logger scoped to a named module (`{ module: name }`). */
export function createLogger(name: string): Logger {
  return logger.child({ module: name });
}
