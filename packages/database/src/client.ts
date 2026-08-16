import { PrismaClient } from '@prisma/client';

// Cache the PrismaClient instance on `globalThis` outside production so that
// hot-reloading dev processes (tsx watch, Next.js dev) reuse one connection
// pool instead of opening a new one on every reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Builds the Prisma log config from LOG_LEVEL; 'query' logging only fires when LOG_LEVEL=trace. */
function buildLogConfig(): ('query' | 'info' | 'warn' | 'error')[] {
  const level = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  const levels: ('query' | 'info' | 'warn' | 'error')[] = ['warn', 'error'];
  if (level === 'trace') levels.unshift('query', 'info');
  else if (level === 'debug' || level === 'info') levels.unshift('info');
  return levels;
}

/** Shared PrismaClient singleton for the whole monorepo; reused across hot reloads in non-production. */
export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: buildLogConfig(),
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export type { PrismaClient } from '@prisma/client';
