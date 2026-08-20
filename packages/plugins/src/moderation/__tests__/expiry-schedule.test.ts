import { describe, expect, it, vi } from 'vitest';
import type { Queue } from 'bullmq';
import type { PluginContext } from '../../sdk';
import { createTestContext } from '../../sdk/testing';
import { ModerationServiceImpl } from '../service';
import { createCasePrisma, GUILD_ID } from './fakes';

const CASE_ID = 'ckcase00000000000000000001';

interface RecordedAdd {
  name: string;
  data: unknown;
  opts: { jobId?: string; delay?: number };
}

/**
 * A queue that enforces BullMQ's own custom-id rule (`Job.validateOptions`: an id containing `:` must split
 * into exactly three segments). `scheduleExpiry` swallows the rejection, so without this the test would
 * happily pass on an id BullMQ refuses and every temporary punishment would stay permanent in production.
 */
function fakeQueue(): { adds: RecordedAdd[]; queue: PluginContext['queue'] } {
  const adds: RecordedAdd[] = [];
  const add = vi.fn(async (name: string, data: unknown, opts: RecordedAdd['opts']) => {
    adds.push({ name, data, opts });
    if (opts?.jobId?.includes(':') && opts.jobId.split(':').length !== 3) {
      throw new Error('Custom Id cannot contain :');
    }
    return {};
  });
  const queue = { add } as unknown as Queue;
  return { adds, queue: () => queue };
}

function buildService(): { service: ModerationServiceImpl; adds: RecordedAdd[] } {
  const { prisma } = createCasePrisma(CASE_ID);
  const { adds, queue } = fakeQueue();
  const member = { timeout: vi.fn(async () => undefined) };
  const client = {
    guilds: { fetch: async () => ({ name: 'Test Guild', members: { fetch: async () => member } }), cache: new Map() },
    users: { fetch: async () => null },
  } as unknown as PluginContext['client'];

  const { ctx } = createTestContext({ config: {}, overrides: { prisma, queue, client } });
  return { service: new ModerationServiceImpl(ctx), adds };
}

describe('scheduleExpiry — delayed job id', () => {
  it('schedules a timeout expiry with a job id BullMQ accepts', async () => {
    const { service, adds } = buildService();

    await service.timeout({
      guildId: GUILD_ID,
      targetId: '444444444444444444',
      moderatorId: '555555555555555555',
      durationMs: 60_000,
      source: 'BOT',
      dmUser: false,
    });

    expect(adds).toHaveLength(1);
    expect(adds[0].opts.jobId).toBe(`case-${CASE_ID}`);
    expect(adds[0].opts.jobId).not.toContain(':');
    expect(adds[0].opts.delay).toBe(60_000);
  });

  it("schedules the enforcer's timed mute (a ROLE_ADD case with a duration) the same way", async () => {
    const { service, adds } = buildService();

    await service.createCase({
      guildId: GUILD_ID,
      type: 'ROLE_ADD',
      targetId: '444444444444444444',
      moderatorId: '555555555555555555',
      durationMs: 120_000,
      source: 'BOT',
      dmUser: false,
      metadata: { enforcerMute: true, roleId: '666666666666666666' },
    });

    expect(adds).toHaveLength(1);
    expect(adds[0].opts.jobId).toBe(`case-${CASE_ID}`);
    expect(adds[0].opts.delay).toBe(120_000);
  });
});
