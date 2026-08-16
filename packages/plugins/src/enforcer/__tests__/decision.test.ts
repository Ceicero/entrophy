import { describe, expect, it } from 'vitest';
import type { Client } from 'discord.js';
import type { PrismaClient } from '@entrophy/database';
import { createTestContext } from '../../sdk/testing';
import { createEnforcerService } from '../service';
import type { EnforcerConfig } from '../manifest';
import type { ModerationService } from '../../sdk/services';

function defaultConfig(overrides: Partial<EnforcerConfig> = {}): EnforcerConfig {
  return {
    ledgerChannelId: null,
    ledgerVisibility: 'staff',
    flagChannelId: null,
    muteRoleId: null,
    captureContext: true,
    contextBefore: 5,
    contextAfter: 3,
    excerptMaxChars: 300,
    autoFlagEnabled: true,
    exemptStaff: true,
    aiAssist: false,
    dmOnAction: true,
    defaultTimeoutMinutes: 60,
    defaultMuteMinutes: null,
    requireReasonOn: ['kick', 'ban'],
    allowedDecisions: ['warn', 'timeout', 'mute', 'kick', 'ban', 'dismiss'],
    banDeleteMessageSeconds: 0,
    ...overrides,
  };
}

/** Guild fake with just enough surface for a DISMISS decision — member lookups fail closed to `null` via `fetchMemberSafe`. */
function fakeClient(): Client<true> {
  const guild = {
    id: 'g1',
    members: {
      fetch: () => Promise.reject(new Error('no member cache in this test fake')),
    },
    channels: {
      fetch: () => Promise.resolve(null),
    },
  };
  return {
    guilds: { fetch: async () => guild },
  } as unknown as Client<true>;
}

interface FakeRecord {
  id: string;
  guildId: string;
  recordNumber: number;
  status: string;
  userId: string;
  flagMessageId: string | null;
  policyId: string | null;
  policyName: string | null;
  channelId: string | null;
  messageId: string | null;
  messageJumpUrl: string | null;
  excerpt: string | null;
  source: string;
  createdAt: Date;
}

function makeFakePrisma(record: FakeRecord): PrismaClient {
  let recordNumberSeq = 1000;
  return {
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({ enforcerRecord: { aggregate: () => Promise.resolve({ _max: { recordNumber: recordNumberSeq } }) } }),
    enforcerRecord: {
      findFirst: () => Promise.resolve({ ...record }),
      create: (args: { data: Record<string, unknown> }) => {
        recordNumberSeq += 1;
        return Promise.resolve({ id: `decision-${recordNumberSeq}`, recordNumber: recordNumberSeq, createdAt: new Date(), ...args.data });
      },
      update: (args: { data: Partial<FakeRecord> }) => {
        Object.assign(record, args.data);
        return Promise.resolve({ ...record });
      },
    },
  } as unknown as PrismaClient;
}

function fakeModeration(): ModerationService {
  return {
    createCase: async () => ({ id: 'case-1', caseNumber: 1 }) as never,
    warn: async () => ({ id: 'case-1', caseNumber: 1 }) as never,
    timeout: async () => ({ id: 'case-1', caseNumber: 1 }) as never,
    getCase: async () => null,
    listCases: async () => ({ items: [], nextCursor: null }),
    openAppeal: async () => ({ appealId: 'appeal-1' }),
    getCaseByNumber: async () => null,
    exportCases: async () => ({ csv: '', count: 0 }),
  };
}

function baseRecord(overrides: Partial<FakeRecord> = {}): FakeRecord {
  return {
    id: 'rec-1',
    guildId: 'g1',
    recordNumber: 1,
    status: 'PENDING',
    userId: 'user-1',
    flagMessageId: null,
    policyId: null,
    policyName: null,
    channelId: null,
    messageId: null,
    messageJumpUrl: null,
    excerpt: null,
    source: 'AUTO',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('EnforcerService.decide — locking', () => {
  it('rejects a second concurrent decision while the first holds the lock', async () => {
    const record = baseRecord();
    const prisma = makeFakePrisma(record);
    const { ctx } = createTestContext({ config: defaultConfig(), overrides: { prisma, client: fakeClient() } });
    ctx.services.register('moderation', fakeModeration());
    const service = createEnforcerService(ctx);

    const [a, b] = await Promise.allSettled([
      service.decide({ guildId: 'g1', recordId: 'rec-1', decision: 'DISMISS', moderatorId: 'mod-1', source: 'bot' }),
      service.decide({ guildId: 'g1', recordId: 'rec-1', decision: 'DISMISS', moderatorId: 'mod-2', source: 'bot' }),
    ]);

    const results = [a, b];
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(/already being decided/i);
  });
});

describe('EnforcerService.decide — double-decide rejection', () => {
  it('rejects deciding a flag that has already been decided', async () => {
    const record = baseRecord();
    const prisma = makeFakePrisma(record);
    const { ctx } = createTestContext({ config: defaultConfig(), overrides: { prisma, client: fakeClient() } });
    ctx.services.register('moderation', fakeModeration());
    const service = createEnforcerService(ctx);

    const first = await service.decide({ guildId: 'g1', recordId: 'rec-1', decision: 'DISMISS', moderatorId: 'mod-1', source: 'bot' });
    expect(first.recordNumber).toBe(1);

    await expect(service.decide({ guildId: 'g1', recordId: 'rec-1', decision: 'DISMISS', moderatorId: 'mod-2', source: 'bot' })).rejects.toThrow(/already been decided/i);
  });
});

describe('EnforcerService.decide — allowedDecisions', () => {
  it('rejects a decision that is not in the guild\'s allowedDecisions list', async () => {
    const record = baseRecord();
    const prisma = makeFakePrisma(record);
    const { ctx } = createTestContext({ config: defaultConfig({ allowedDecisions: ['dismiss'] }), overrides: { prisma, client: fakeClient() } });
    ctx.services.register('moderation', fakeModeration());
    const service = createEnforcerService(ctx);

    await expect(service.decide({ guildId: 'g1', recordId: 'rec-1', decision: 'WARN', moderatorId: 'mod-1', source: 'bot' })).rejects.toThrow(/disabled on this server/i);
  });

  it('still allows a decision that IS in a restricted allowedDecisions list', async () => {
    const record = baseRecord();
    const prisma = makeFakePrisma(record);
    const { ctx } = createTestContext({ config: defaultConfig({ allowedDecisions: ['dismiss'] }), overrides: { prisma, client: fakeClient() } });
    ctx.services.register('moderation', fakeModeration());
    const service = createEnforcerService(ctx);

    await expect(service.decide({ guildId: 'g1', recordId: 'rec-1', decision: 'DISMISS', moderatorId: 'mod-1', source: 'bot' })).resolves.toMatchObject({ recordNumber: 1 });
  });

  it('exempts UNMUTE from allowedDecisions entirely — it is not one of the flag-queue decisions', async () => {
    const record = baseRecord();
    const prisma = makeFakePrisma(record);
    const { ctx } = createTestContext({ config: defaultConfig({ allowedDecisions: ['dismiss'], muteRoleId: 'role-1' }), overrides: { prisma, client: fakeClient() } });
    ctx.services.register('moderation', fakeModeration());
    const service = createEnforcerService(ctx);

    await expect(service.decide({ guildId: 'g1', recordId: 'rec-1', decision: 'UNMUTE', moderatorId: 'mod-1', source: 'bot' })).resolves.toMatchObject({ recordNumber: 1 });
  });
});

describe('EnforcerService.decide — bot-actions envelope normalization', () => {
  it('accepts the {guildId, payload, requestedBy} shape used by apps/bot/src/host/bot-actions.ts', async () => {
    const record = baseRecord();
    const prisma = makeFakePrisma(record);
    const { ctx } = createTestContext({ config: defaultConfig(), overrides: { prisma, client: fakeClient() } });
    ctx.services.register('moderation', fakeModeration());
    const service = createEnforcerService(ctx);

    // The public `EnforcerService.decide` type is `EnforcerDecideInput` only — this envelope shape is what
    // `apps/bot/src/host/bot-actions.ts` actually passes at runtime for dashboard-initiated decisions (see
    // `normalizeDecideInput` in ../service.ts), so the cast here mirrors that real call site, not a test hack.
    const result = await service.decide({
      guildId: 'g1',
      payload: { recordId: 'rec-1', decision: 'DISMISS', reason: 'dashboard dismiss' },
      requestedBy: 'dashboard-user-1',
    } as unknown as Parameters<typeof service.decide>[0]);
    expect(result.recordNumber).toBe(1);
  });
});
