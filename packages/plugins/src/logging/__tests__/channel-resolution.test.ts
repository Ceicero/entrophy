import { describe, expect, it } from 'vitest';
import { resolveLogChannelId } from '../channel-resolution';

describe('resolveLogChannelId', () => {
  it("returns the kind's own channel when set", () => {
    const channels = { 'member.join': 'chan-1', default: 'chan-default' };
    expect(resolveLogChannelId(channels, 'member.join')).toBe('chan-1');
  });

  it('falls back to the default channel when the kind has no channel of its own', () => {
    const channels = { default: 'chan-default' };
    expect(resolveLogChannelId(channels, 'member.leave')).toBe('chan-default');
  });

  it("returns null when neither the kind nor 'default' is set", () => {
    expect(resolveLogChannelId({}, 'voice.join')).toBeNull();
  });

  it('falls back to default when the kind is explicitly null (nullish-coalescing, same as unset)', () => {
    const channels = { 'message.delete': null, default: 'chan-default' };
    expect(resolveLogChannelId(channels, 'message.delete')).toBe('chan-default');
  });

  it('returns null when the kind is unset and default is explicitly null', () => {
    const channels = { default: null };
    expect(resolveLogChannelId(channels, 'guild.update')).toBeNull();
  });
});
