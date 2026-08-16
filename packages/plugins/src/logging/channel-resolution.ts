import type { LogKind } from '../sdk';

export type LogChannelMap = Partial<Record<LogKind | 'default', string | null | undefined>>;

/** Resolves the channel id to post a `kind` log to: its own `channels[kind]` entry, falling back to `channels.default`, or `null` if neither is set (in which case nothing is posted, though `LogEvent` storage is unaffected). */
export function resolveLogChannelId(channels: LogChannelMap, kind: LogKind): string | null {
  return channels[kind] ?? channels.default ?? null;
}
