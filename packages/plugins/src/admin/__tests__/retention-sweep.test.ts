import { describe, expect, it } from 'vitest';
import { createTestContext } from '../../sdk/testing';
import { retentionSweepJob } from '../jobs/retention-sweep';

const GUILD_A = 'guild-a';
const GUILD_B = 'guild-b';

describe('retentionSweepJob', () => {
  it("runs the retention purge for every bot-present guild, using each guild's stored policy or the default", async () => {
    const auditDeleteManyCalls: unknown[] = [];
    const caseUpdateManyCalls: unknown[] = [];

    const { ctx } = createTestContext({
      prismaOverrides: {
        guild: {
          findMany: async () => [{ id: GUILD_A }, { id: GUILD_B }],
        },
        dataRetentionPolicy: {
          // Guild A has a custom policy (auditLog kept 10 days); guild B has none, so defaults apply.
          findUnique: async (args: any) =>
            args.where.guildId === GUILD_A
              ? {
                  auditLogDays: 10,
                  logEventDays: 90,
                  moderationCaseDays: null,
                  automodEventDays: 90,
                  ticketTranscriptDays: 90,
                  levelInactivityDays: null,
                  analyticsDays: 365,
                }
              : null,
        },
        auditLog: {
          deleteMany: async (args: any) => {
            auditDeleteManyCalls.push(args);
            return { count: 3 };
          },
        },
        logEvent: { deleteMany: async () => ({ count: 0 }) },
        moderationCase: {
          updateMany: async (args: any) => {
            caseUpdateManyCalls.push(args);
            return { count: 0 };
          },
        },
        automodEvent: { deleteMany: async () => ({ count: 0 }) },
        ticketTranscript: { deleteMany: async () => ({ count: 0 }) },
        levelProfile: { deleteMany: async () => ({ count: 0 }) },
        guildAnalyticsDaily: { deleteMany: async () => ({ count: 0 }) },
        enforcerRecord: { deleteMany: async () => ({ count: 0 }) },
      },
    });

    await retentionSweepJob.processor(ctx, {} as never);

    expect(auditDeleteManyCalls).toHaveLength(2); // one per guild
    const guildACutoffArgs = (auditDeleteManyCalls[0] as any).where.createdAt.lt as Date;
    const guildBCutoffArgs = (auditDeleteManyCalls[1] as any).where.createdAt.lt as Date;
    // Guild A's custom 10-day cutoff should be much more recent than guild B's default 365-day cutoff.
    expect(guildACutoffArgs.getTime()).toBeGreaterThan(guildBCutoffArgs.getTime());

    // moderationCaseDays is null (keep forever) for both guilds — never soft-deleted.
    expect(caseUpdateManyCalls).toHaveLength(0);
  });

  it('isolates a per-guild failure — one bad guild does not stop the sweep for the rest', async () => {
    const auditDeleteManyCalls: unknown[] = [];

    const { ctx } = createTestContext({
      prismaOverrides: {
        guild: { findMany: async () => [{ id: GUILD_A }, { id: GUILD_B }] },
        dataRetentionPolicy: {
          findUnique: async (args: any) => {
            if (args.where.guildId === GUILD_A) throw new Error('db hiccup for guild A');
            return null;
          },
        },
        auditLog: {
          deleteMany: async (args: any) => {
            auditDeleteManyCalls.push(args);
            return { count: 1 };
          },
        },
        logEvent: { deleteMany: async () => ({ count: 0 }) },
        moderationCase: { updateMany: async () => ({ count: 0 }) },
        automodEvent: { deleteMany: async () => ({ count: 0 }) },
        ticketTranscript: { deleteMany: async () => ({ count: 0 }) },
        levelProfile: { deleteMany: async () => ({ count: 0 }) },
        guildAnalyticsDaily: { deleteMany: async () => ({ count: 0 }) },
        enforcerRecord: { deleteMany: async () => ({ count: 0 }) },
      },
    });

    await expect(retentionSweepJob.processor(ctx, {} as never)).resolves.toBeUndefined();

    // Only guild B's sweep completed (guild A's policy lookup threw and was caught).
    expect(auditDeleteManyCalls).toHaveLength(1);
  });
});
