import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { EmbedBuilder } from 'discord.js';
import { LogBatcher } from '../batcher';

function fakeEmbed(id: number): EmbedBuilder {
  return { id } as unknown as EmbedBuilder;
}

describe('LogBatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('flushes automatically after the configured interval with everything queued so far', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = new LogBatcher({ send, flushIntervalMs: 2000, maxBatchSize: 5 });

    batcher.enqueue('chan-1', fakeEmbed(1));
    batcher.enqueue('chan-1', fakeEmbed(2));
    expect(send).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2000);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('chan-1', [fakeEmbed(1), fakeEmbed(2)]);
  });

  it('flushes immediately once maxBatchSize is reached, without waiting for the timer', () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = new LogBatcher({ send, flushIntervalMs: 2000, maxBatchSize: 3 });

    batcher.enqueue('chan-1', fakeEmbed(1));
    batcher.enqueue('chan-1', fakeEmbed(2));
    expect(send).not.toHaveBeenCalled();
    batcher.enqueue('chan-1', fakeEmbed(3));

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('chan-1', [fakeEmbed(1), fakeEmbed(2), fakeEmbed(3)]);
    expect(batcher.pendingCount('chan-1')).toBe(0);
  });

  it('batches each channel independently', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = new LogBatcher({ send, flushIntervalMs: 2000, maxBatchSize: 5 });

    batcher.enqueue('chan-1', fakeEmbed(1));
    batcher.enqueue('chan-2', fakeEmbed(2));

    await vi.advanceTimersByTimeAsync(2000);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith('chan-1', [fakeEmbed(1)]);
    expect(send).toHaveBeenCalledWith('chan-2', [fakeEmbed(2)]);
  });

  it('starts a fresh batch after a flush instead of re-sending old embeds', () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = new LogBatcher({ send, flushIntervalMs: 2000, maxBatchSize: 2 });

    batcher.enqueue('chan-1', fakeEmbed(1));
    batcher.enqueue('chan-1', fakeEmbed(2)); // hits maxBatchSize, flushes
    batcher.enqueue('chan-1', fakeEmbed(3));

    expect(send).toHaveBeenCalledTimes(1);
    expect(batcher.pendingCount('chan-1')).toBe(1);
  });

  it('reports send failures via onError instead of throwing', async () => {
    const err = new Error('rate limited');
    const send = vi.fn().mockRejectedValue(err);
    const onError = vi.fn();
    const batcher = new LogBatcher({ send, onError, flushIntervalMs: 2000, maxBatchSize: 1 });

    batcher.enqueue('chan-1', fakeEmbed(1));
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledWith('chan-1', err);
  });

  it('flushAll flushes every channel with a pending batch', () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = new LogBatcher({ send, flushIntervalMs: 2000, maxBatchSize: 5 });

    batcher.enqueue('chan-1', fakeEmbed(1));
    batcher.enqueue('chan-2', fakeEmbed(2));
    batcher.flushAll();

    expect(send).toHaveBeenCalledTimes(2);
  });

  it('flush() on a channel with nothing queued is a harmless no-op', () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const batcher = new LogBatcher({ send });
    expect(() => batcher.flush('never-used')).not.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
});
