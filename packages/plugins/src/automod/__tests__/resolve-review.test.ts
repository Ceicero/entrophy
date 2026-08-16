import { describe, expect, it } from 'vitest';
import { createTestContext } from '../../sdk/testing';
import { resolveReview } from '../service';

describe('resolveReview', () => {
  it('returns null when the event does not belong to the guild', async () => {
    const { ctx } = createTestContext({
      prismaOverrides: { automodEvent: { findFirst: async () => null } },
    });

    const result = await resolveReview(ctx, 'g1', 'event1', 'CONFIRMED', 'mod1');
    expect(result).toBeNull();
  });

  it('updates reviewStatus/reviewedBy/reviewedAt when the event exists', async () => {
    const existing = { id: 'event1', guildId: 'g1', reviewStatus: 'PENDING' };
    let updateArgs: unknown;
    const { ctx } = createTestContext({
      prismaOverrides: {
        automodEvent: {
          findFirst: async () => existing,
          update: async (...args: unknown[]) => {
            updateArgs = args[0];
            return { ...existing, reviewStatus: 'FALSE_POSITIVE', reviewedBy: 'mod1', reviewedAt: new Date() };
          },
        },
      },
    });

    const result = await resolveReview(ctx, 'g1', 'event1', 'FALSE_POSITIVE', 'mod1');
    expect(result?.reviewStatus).toBe('FALSE_POSITIVE');
    expect((updateArgs as { data: { reviewedBy: string } }).data.reviewedBy).toBe('mod1');
  });
});
