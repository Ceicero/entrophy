import { describe, expect, it } from 'vitest';
import { createTestContext } from '../../sdk/testing';
import { claimAlertOnce } from '../providers/util';

describe('claimAlertOnce', () => {
  it('returns true the first time an item is seen, and false on every repeat', async () => {
    const { ctx } = createTestContext();

    expect(await claimAlertOnce(ctx, 'twitch', 'connection-1', 'stream-abc')).toBe(true);
    expect(await claimAlertOnce(ctx, 'twitch', 'connection-1', 'stream-abc')).toBe(false);
    expect(await claimAlertOnce(ctx, 'twitch', 'connection-1', 'stream-abc')).toBe(false);
  });

  it('scopes dedupe independently per connection and per provider', async () => {
    const { ctx } = createTestContext();

    expect(await claimAlertOnce(ctx, 'twitch', 'connection-1', 'item-1')).toBe(true);
    expect(await claimAlertOnce(ctx, 'twitch', 'connection-2', 'item-1')).toBe(true); // different connection
    expect(await claimAlertOnce(ctx, 'youtube', 'connection-1', 'item-1')).toBe(true); // different provider
  });
});
