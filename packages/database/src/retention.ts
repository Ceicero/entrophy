import type { DataRetentionPolicy, PrismaClient } from '@prisma/client';

/** Retention policy values matching the Prisma schema defaults for a guild that has not customised its policy. */
export const defaultRetentionPolicy: Pick<
  DataRetentionPolicy,
  | 'auditLogDays'
  | 'logEventDays'
  | 'moderationCaseDays'
  | 'automodEventDays'
  | 'ticketTranscriptDays'
  | 'levelInactivityDays'
  | 'analyticsDays'
> = {
  auditLogDays: 365,
  logEventDays: 90,
  moderationCaseDays: null,
  automodEventDays: 90,
  ticketTranscriptDays: 90,
  levelInactivityDays: null,
  analyticsDays: 365,
};

export type RetentionPolicyDays = typeof defaultRetentionPolicy;

/** One purgeable table: which policy field controls its cutoff, and how to delete rows older than that cutoff for a guild. */
export interface RetentionTarget {
  name: string;
  policyField: keyof RetentionPolicyDays;
  purge(prisma: PrismaClient, guildId: string, cutoff: Date): Promise<number>;
}

/** Purgeable tables driven by DataRetentionPolicy, in the order they are processed by runRetentionForGuild. */
export const RETENTION_TARGETS: RetentionTarget[] = [
  {
    name: 'auditLog',
    policyField: 'auditLogDays',
    async purge(prisma, guildId, cutoff) {
      const result = await prisma.auditLog.deleteMany({
        where: { guildId, createdAt: { lt: cutoff } },
      });
      return result.count;
    },
  },
  {
    name: 'logEvent',
    policyField: 'logEventDays',
    async purge(prisma, guildId, cutoff) {
      const result = await prisma.logEvent.deleteMany({
        where: { guildId, createdAt: { lt: cutoff } },
      });
      return result.count;
    },
  },
  {
    name: 'moderationCase',
    policyField: 'moderationCaseDays',
    async purge(prisma, guildId, cutoff) {
      // Soft delete only — moderation cases are the append-only compliance
      // record; never hard-delete them from a retention sweep.
      const result = await prisma.moderationCase.updateMany({
        where: { guildId, createdAt: { lt: cutoff }, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      return result.count;
    },
  },
  {
    name: 'automodEvent',
    policyField: 'automodEventDays',
    async purge(prisma, guildId, cutoff) {
      const result = await prisma.automodEvent.deleteMany({
        where: { guildId, createdAt: { lt: cutoff } },
      });
      return result.count;
    },
  },
  {
    name: 'ticketTranscript',
    policyField: 'ticketTranscriptDays',
    async purge(prisma, guildId, cutoff) {
      const result = await prisma.ticketTranscript.deleteMany({
        where: { generatedAt: { lt: cutoff }, ticket: { guildId } },
      });
      return result.count;
    },
  },
  {
    name: 'levelProfile',
    policyField: 'levelInactivityDays',
    async purge(prisma, guildId, cutoff) {
      const result = await prisma.levelProfile.deleteMany({
        where: {
          guildId,
          OR: [{ lastXpAt: { lt: cutoff } }, { lastXpAt: null, createdAt: { lt: cutoff } }],
        },
      });
      return result.count;
    },
  },
  {
    name: 'guildAnalyticsDaily',
    policyField: 'analyticsDays',
    async purge(prisma, guildId, cutoff) {
      const result = await prisma.guildAnalyticsDaily.deleteMany({
        where: { guildId, date: { lt: cutoff } },
      });
      return result.count;
    },
  },
];

/** Runs every retention target for a guild against its policy, skipping targets whose policy field is null (= keep forever). Returns rows affected per target. */
export async function runRetentionForGuild(
  prisma: PrismaClient,
  guildId: string,
  policy: RetentionPolicyDays,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const now = Date.now();

  for (const target of RETENTION_TARGETS) {
    const days = policy[target.policyField];
    if (days === null || days === undefined) {
      counts[target.name] = 0;
      continue;
    }
    const cutoff = new Date(now - days * 24 * 60 * 60 * 1000);
    counts[target.name] = await target.purge(prisma, guildId, cutoff);
  }

  return counts;
}
