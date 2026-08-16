import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildTestApp, loginAs, seedUserGuilds } from './helpers/build-test-app';

const GUILD_ID = '111111111111111111';
const USER_ID = '222222222222222222';

interface FakePolicy {
  id: string;
  guildId: string;
  name: string;
  description: string;
  enabled: boolean;
  severity: string;
  matchers: unknown[];
  channelIds: string[];
  exemptRoleIds: string[];
  exemptChannelIds: string[];
  suggestedAction: string | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface FakeRecord {
  id: string;
  guildId: string;
  recordNumber: number;
  kind: string;
  status: string | null;
  userId: string;
  channelId: string | null;
  messageId: string | null;
  messageJumpUrl: string | null;
  policyId: string | null;
  policyName: string | null;
  matcherSummary: string | null;
  riskScore: number | null;
  aiExplanation: string | null;
  excerpt: string | null;
  contextSnapshot: unknown;
  source: string;
  flaggedBy: string | null;
  decision: string | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionReason: string | null;
  durationMs: number | null;
  caseId: string | null;
  parentRecordId: string | null;
  ledgerMessageId: string | null;
  flagMessageId: string | null;
  createdAt: Date;
}

function enforcerOverrides() {
  const policies = new Map<string, FakePolicy>();
  const records = new Map<string, FakeRecord>();
  // `GuildConfigStore.getConfig`/`setConfig` (backing the settings routes) read/write `PluginConfig` and
  // invalidate their Redis cache on every write — so the settings PUT->GET round trip needs a real, stateful
  // `pluginConfig` fake, not the generic stub's always-`null`/always-`undefined` defaults.
  const pluginConfigRows = new Map<string, { guildId: string; pluginId: string; config: Record<string, unknown>; version: number }>();

  return {
    store: { policies, records },
    overrides: {
      guild: { findUnique: async () => ({ id: GUILD_ID, botPresent: true }) },
      pluginConfig: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findUnique: async (args: any) => pluginConfigRows.get(`${args.where.guildId_pluginId.guildId}:${args.where.guildId_pluginId.pluginId}`) ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        upsert: async (args: any) => {
          const key = `${args.where.guildId_pluginId.guildId}:${args.where.guildId_pluginId.pluginId}`;
          const existing = pluginConfigRows.get(key);
          const row = existing
            ? { ...existing, config: args.update.config, version: existing.version + 1 }
            : { guildId: args.create.guildId, pluginId: args.create.pluginId, config: args.create.config, version: 1 };
          pluginConfigRows.set(key, row);
          return row;
        },
      },
      enforcerPolicy: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fake, args shape mirrors Prisma's generated types
        findMany: async (args: any) => [...policies.values()].filter((p) => p.guildId === args?.where?.guildId && (args?.where?.deletedAt === undefined || p.deletedAt === args.where.deletedAt)),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findFirst: async (args: any) => {
          const found = policies.get(args?.where?.id);
          if (!found) return null;
          if (args?.where?.guildId && found.guildId !== args.where.guildId) return null;
          if (args?.where?.deletedAt === null && found.deletedAt !== null) return null;
          return found;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: async (args: any) => {
          const row: FakePolicy = { id: randomUUID(), updatedBy: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, ...args.data };
          policies.set(row.id, row);
          return row;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        update: async (args: any) => {
          const existing = policies.get(args.where.id);
          if (!existing) throw new Error('not found');
          const updated = { ...existing, ...args.data, updatedAt: new Date() };
          policies.set(existing.id, updated);
          return updated;
        },
      },
      enforcerRecord: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findMany: async (args: any) => {
          let list = [...records.values()].filter((r) => r.guildId === args?.where?.guildId);
          if (args?.where?.kind) list = list.filter((r) => r.kind === args.where.kind);
          if (args?.where?.status) list = list.filter((r) => r.status === args.where.status);
          list.sort((a, b) => (args?.orderBy?.createdAt === 'asc' ? a.createdAt.getTime() - b.createdAt.getTime() : b.createdAt.getTime() - a.createdAt.getTime()));
          return list;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findUnique: async (args: any) => {
          const key = args?.where?.guildId_recordNumber;
          if (!key) return null;
          return [...records.values()].find((r) => r.guildId === key.guildId && r.recordNumber === key.recordNumber) ?? null;
        },
      },
    },
  };
}

async function authedContext() {
  const { store, overrides } = enforcerOverrides();
  const { app, redis, queues } = await buildTestApp(overrides);
  const { cookieHeader, session } = await loginAs(app, redis, { userId: USER_ID });
  await seedUserGuilds(redis, USER_ID, [{ id: GUILD_ID, owner: true, permissions: '8' }]);
  const mutHeaders = { cookie: cookieHeader, origin: 'http://localhost:3000', 'x-csrf-token': session.csrfToken };
  return { app, cookieHeader, mutHeaders, store, queues };
}

function makeRecord(overrides: Partial<FakeRecord> = {}): FakeRecord {
  return {
    id: randomUUID(),
    guildId: GUILD_ID,
    recordNumber: 1,
    kind: 'FLAG',
    status: 'PENDING',
    userId: 'user-1',
    channelId: null,
    messageId: null,
    messageJumpUrl: null,
    policyId: null,
    policyName: null,
    matcherSummary: null,
    riskScore: null,
    aiExplanation: null,
    excerpt: null,
    contextSnapshot: null,
    source: 'AUTO',
    flaggedBy: null,
    decision: null,
    decidedBy: null,
    decidedAt: null,
    decisionReason: null,
    durationMs: null,
    caseId: null,
    parentRecordId: null,
    ledgerMessageId: null,
    flagMessageId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('enforcer settings', () => {
  it('GET returns the default settings before any write', async () => {
    const { app, cookieHeader } = await authedContext();
    const res = await app.inject({ method: 'GET', url: `/guilds/${GUILD_ID}/enforcer/settings`, headers: { cookie: cookieHeader } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ledgerChannelId: null, ledgerVisibility: 'staff', autoFlagEnabled: true, captureContext: true });
  });

  it('PUT updates settings and GET reflects the change', async () => {
    const { app, mutHeaders, cookieHeader } = await authedContext();
    const put = await app.inject({
      method: 'PUT',
      url: `/guilds/${GUILD_ID}/enforcer/settings`,
      headers: mutHeaders,
      payload: { ledgerChannelId: '333333333333333333', ledgerVisibility: 'everyone', captureContext: false },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ ledgerChannelId: '333333333333333333', ledgerVisibility: 'everyone', captureContext: false });

    const get = await app.inject({ method: 'GET', url: `/guilds/${GUILD_ID}/enforcer/settings`, headers: { cookie: cookieHeader } });
    expect(get.json()).toMatchObject({ ledgerChannelId: '333333333333333333', ledgerVisibility: 'everyone' });
  });

  it('PUT rejects an invalid ledgerVisibility value', async () => {
    const { app, mutHeaders } = await authedContext();
    const res = await app.inject({ method: 'PUT', url: `/guilds/${GUILD_ID}/enforcer/settings`, headers: mutHeaders, payload: { ledgerVisibility: 'public' } });
    expect(res.statusCode).toBe(400);
  });
});

describe('enforcer policies CRUD', () => {
  it('GET returns an empty list, POST creates a policy, GET /:id returns it', async () => {
    const { app, mutHeaders, cookieHeader } = await authedContext();

    const empty = await app.inject({ method: 'GET', url: `/guilds/${GUILD_ID}/enforcer/policies`, headers: { cookie: cookieHeader } });
    expect(empty.json()).toEqual([]);

    const created = await app.inject({
      method: 'POST',
      url: `/guilds/${GUILD_ID}/enforcer/policies`,
      headers: mutHeaders,
      payload: { name: 'No invites', description: 'Blocks invite links.', severity: 'MEDIUM', matchers: [{ type: 'invite', value: 'discord-invite' }] },
    });
    expect(created.statusCode).toBe(201);
    const policyId = created.json().id;
    expect(created.json().name).toBe('No invites');

    const fetched = await app.inject({ method: 'GET', url: `/guilds/${GUILD_ID}/enforcer/policies/${policyId}`, headers: { cookie: cookieHeader } });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().id).toBe(policyId);
  });

  it('POST rejects a policy with no matchers', async () => {
    const { app, mutHeaders } = await authedContext();
    const res = await app.inject({
      method: 'POST',
      url: `/guilds/${GUILD_ID}/enforcer/policies`,
      headers: mutHeaders,
      payload: { name: 'Empty', description: 'x', severity: 'LOW', matchers: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST rejects a catastrophic regex matcher', async () => {
    const { app, mutHeaders } = await authedContext();
    const res = await app.inject({
      method: 'POST',
      url: `/guilds/${GUILD_ID}/enforcer/policies`,
      headers: mutHeaders,
      payload: { name: 'Evil', description: 'x', severity: 'LOW', matchers: [{ type: 'regex', value: '(a+)+$' }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PUT updates a policy, DELETE soft-deletes it (then 404s)', async () => {
    const { app, mutHeaders, cookieHeader } = await authedContext();
    const created = await app.inject({
      method: 'POST',
      url: `/guilds/${GUILD_ID}/enforcer/policies`,
      headers: mutHeaders,
      payload: { name: 'Temp', description: 'x', severity: 'LOW', matchers: [{ type: 'keyword', value: 'foo' }] },
    });
    const policyId = created.json().id;

    const updated = await app.inject({ method: 'PUT', url: `/guilds/${GUILD_ID}/enforcer/policies/${policyId}`, headers: mutHeaders, payload: { enabled: false } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().enabled).toBe(false);

    const deleted = await app.inject({ method: 'DELETE', url: `/guilds/${GUILD_ID}/enforcer/policies/${policyId}`, headers: mutHeaders });
    expect(deleted.statusCode).toBe(204);

    const fetched = await app.inject({ method: 'GET', url: `/guilds/${GUILD_ID}/enforcer/policies/${policyId}`, headers: { cookie: cookieHeader } });
    expect(fetched.statusCode).toBe(404);
  });

  it('POST .../test reports a match for text that trips the policy, and no match for clean text', async () => {
    const { app, mutHeaders } = await authedContext();
    const created = await app.inject({
      method: 'POST',
      url: `/guilds/${GUILD_ID}/enforcer/policies`,
      headers: mutHeaders,
      payload: { name: 'Word filter', description: 'x', severity: 'LOW', matchers: [{ type: 'keyword', value: 'badword' }] },
    });
    const policyId = created.json().id;

    const hit = await app.inject({ method: 'POST', url: `/guilds/${GUILD_ID}/enforcer/policies/${policyId}/test`, headers: mutHeaders, payload: { text: 'this has badword in it' } });
    expect(hit.json().matched).toBe(true);

    const miss = await app.inject({ method: 'POST', url: `/guilds/${GUILD_ID}/enforcer/policies/${policyId}/test`, headers: mutHeaders, payload: { text: 'a clean message' } });
    expect(miss.json().matched).toBe(false);
  });
});

describe('enforcer records / queue / decide', () => {
  it('GET queue returns only PENDING FLAG records', async () => {
    const { app, mutHeaders, store } = await authedContext();
    store.records.set('r1', makeRecord({ id: 'r1', recordNumber: 1, status: 'PENDING' }));
    store.records.set('r2', makeRecord({ id: 'r2', recordNumber: 2, status: 'ACTIONED', kind: 'DECISION' }));

    const res = await app.inject({ method: 'GET', url: `/guilds/${GUILD_ID}/enforcer/queue`, headers: mutHeaders });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
    expect(res.json()[0].id).toBe('r1');
  });

  it('GET records/:recordNumber returns the record, 404s for an unknown number', async () => {
    const { app, mutHeaders, store } = await authedContext();
    store.records.set('r1', makeRecord({ id: 'r1', recordNumber: 7 }));

    const found = await app.inject({ method: 'GET', url: `/guilds/${GUILD_ID}/enforcer/records/7`, headers: mutHeaders });
    expect(found.statusCode).toBe(200);
    expect(found.json().recordNumber).toBe(7);

    const missing = await app.inject({ method: 'GET', url: `/guilds/${GUILD_ID}/enforcer/records/999`, headers: mutHeaders });
    expect(missing.statusCode).toBe(404);
  });

  it('POST .../decide enqueues an enforcer.decide bot-action and 404s for an unknown record', async () => {
    const { app, mutHeaders, store, queues } = await authedContext();
    store.records.set('r1', makeRecord({ id: 'r1', recordNumber: 3 }));

    const res = await app.inject({
      method: 'POST',
      url: `/guilds/${GUILD_ID}/enforcer/records/3/decide`,
      headers: mutHeaders,
      payload: { decision: 'WARN', reason: 'be nice' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ queued: true });

    const call = queues.calls.find((c) => c.queue === 'bot-actions');
    expect(call).toBeDefined();
    expect(call!.data).toMatchObject({ type: 'enforcer.decide', guildId: GUILD_ID, payload: { recordId: 'r1', decision: 'WARN', reason: 'be nice' } });

    const missing = await app.inject({ method: 'POST', url: `/guilds/${GUILD_ID}/enforcer/records/999/decide`, headers: mutHeaders, payload: { decision: 'WARN' } });
    expect(missing.statusCode).toBe(404);
  });

  it('GET records/export.csv returns CSV content', async () => {
    const { app, mutHeaders, store } = await authedContext();
    store.records.set('r1', makeRecord({ id: 'r1', recordNumber: 1, excerpt: 'hello' }));

    const res = await app.inject({ method: 'GET', url: `/guilds/${GUILD_ID}/enforcer/records/export.csv`, headers: mutHeaders });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.body).toContain('recordNumber,kind,status');
    expect(res.body).toContain('hello');
  });
});
