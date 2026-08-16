import { describe, expect, it } from 'vitest';
import { resolveStripeRoleReward, type StripeEventLike, type StripeRewardRule } from '../providers/stripe';

const rewards: StripeRewardRule[] = [{ priceId: 'price_123', roleId: '111111111111111111' }];

describe('resolveStripeRoleReward', () => {
  it('maps checkout.session.completed to an add action via client_reference_id', () => {
    const event: StripeEventLike = {
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: '222222222222222222',
          metadata: { priceId: 'price_123', guildId: 'g1' },
        },
      },
    };
    const result = resolveStripeRoleReward(event, rewards);
    expect(result).toEqual({
      guildId: 'g1',
      discordUserId: '222222222222222222',
      priceId: 'price_123',
      roleId: '111111111111111111',
      action: 'add',
    });
  });

  it('falls back to metadata.discord_user_id when client_reference_id is absent', () => {
    const event: StripeEventLike = {
      type: 'checkout.session.completed',
      data: { object: { metadata: { discord_user_id: '333333333333333333', priceId: 'price_123' } } },
    };
    const result = resolveStripeRoleReward(event, rewards);
    expect(result?.discordUserId).toBe('333333333333333333');
    expect(result?.action).toBe('add');
  });

  it('maps invoice.paid using the first line item price id', () => {
    const event: StripeEventLike = {
      type: 'invoice.paid',
      data: {
        object: {
          metadata: { discord_user_id: '444444444444444444' },
          lines: { data: [{ price: { id: 'price_123' } }] },
        },
      },
    };
    const result = resolveStripeRoleReward(event, rewards);
    expect(result).toMatchObject({
      discordUserId: '444444444444444444',
      roleId: '111111111111111111',
      action: 'add',
    });
  });

  it('maps customer.subscription.deleted to a remove action', () => {
    const event: StripeEventLike = {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          metadata: { discord_user_id: '555555555555555555' },
          items: { data: [{ price: { id: 'price_123' } }] },
        },
      },
    };
    const result = resolveStripeRoleReward(event, rewards);
    expect(result?.action).toBe('remove');
  });

  it('returns null when the discord user id is missing', () => {
    const event: StripeEventLike = {
      type: 'checkout.session.completed',
      data: { object: { metadata: { priceId: 'price_123' } } },
    };
    expect(resolveStripeRoleReward(event, rewards)).toBeNull();
  });

  it('returns null when the price id matches no configured reward', () => {
    const event: StripeEventLike = {
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: '222222222222222222', metadata: { priceId: 'price_unknown' } } },
    };
    expect(resolveStripeRoleReward(event, rewards)).toBeNull();
  });

  it('returns null for an event type it does not handle', () => {
    const event: StripeEventLike = { type: 'payment_intent.succeeded', data: { object: {} } };
    expect(resolveStripeRoleReward(event, rewards)).toBeNull();
  });

  it('is a pure function — the same event and rules always resolve identically (idempotent mapping)', () => {
    const event: StripeEventLike = {
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: '222222222222222222', metadata: { priceId: 'price_123' } } },
    };
    expect(resolveStripeRoleReward(event, rewards)).toEqual(resolveStripeRoleReward(event, rewards));
  });
});
