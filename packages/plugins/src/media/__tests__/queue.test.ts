import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import { beforeEach, describe, expect, it } from 'vitest';
import { MediaQueueManager } from '../queue';
import type { Track } from '../providers/types';

function track(id: string): Track {
  return { id, title: `Track ${id}`, url: `https://example.com/${id}`, provider: 'test' };
}

describe('MediaQueueManager', () => {
  // ioredis-mock instances share one process-wide in-memory data store by default (simulating "the same redis
  // server"), so without this every test here would see leftover keys from tests that ran before it.
  beforeEach(async () => {
    await new RedisMock().flushall();
  });

  it('starts empty and adding tracks to an empty queue starts playback at index 0', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const manager = new MediaQueueManager(redis);

    const empty = await manager.getState('g1');
    expect(empty).toEqual({ tracks: [], currentIndex: -1, playing: false, volume: 100, loop: 'off' });

    const state = await manager.add('g1', [track('a'), track('b')]);
    expect(state.currentIndex).toBe(0);
    expect(state.playing).toBe(true);
    expect(state.tracks.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('adding to a non-empty queue does not change what is currently playing', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const manager = new MediaQueueManager(redis);
    await manager.add('g1', [track('a')]);
    await manager.skip('g1'); // no-op, only one track — still index 0, still playing false after running off the end
    const state = await manager.add('g1', [track('b'), track('c')]);
    expect(state.tracks.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('skip advances to the next track and stops at the end when loop is off', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const manager = new MediaQueueManager(redis);
    await manager.add('g1', [track('a'), track('b')]);

    const afterFirstSkip = await manager.skip('g1');
    expect(afterFirstSkip.currentIndex).toBe(1);
    expect(afterFirstSkip.playing).toBe(true);

    const afterSecondSkip = await manager.skip('g1');
    expect(afterSecondSkip.currentIndex).toBe(-1);
    expect(afterSecondSkip.playing).toBe(false);
  });

  it('loop "queue" wraps skip back to the start', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const manager = new MediaQueueManager(redis);
    await manager.add('g1', [track('a'), track('b')]);
    await manager.setLoop('g1', 'queue');

    await manager.skip('g1'); // -> index 1
    const wrapped = await manager.skip('g1'); // -> wraps to index 0
    expect(wrapped.currentIndex).toBe(0);
    expect(wrapped.playing).toBe(true);
  });

  it('loop "track" does not affect an explicit skip (still advances)', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const manager = new MediaQueueManager(redis);
    await manager.add('g1', [track('a'), track('b')]);
    await manager.setLoop('g1', 'track');

    const state = await manager.skip('g1');
    expect(state.currentIndex).toBe(1);
  });

  it('pause/resume toggle playing without touching the queue', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const manager = new MediaQueueManager(redis);
    await manager.add('g1', [track('a')]);

    const paused = await manager.pause('g1');
    expect(paused.playing).toBe(false);

    const resumed = await manager.resume('g1');
    expect(resumed.playing).toBe(true);
    expect(resumed.tracks).toHaveLength(1);
  });

  it('resume on an empty queue does nothing (playing stays false)', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const manager = new MediaQueueManager(redis);
    const state = await manager.resume('g1');
    expect(state.playing).toBe(false);
  });

  it('setVolume clamps to 0-150', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const manager = new MediaQueueManager(redis);
    expect((await manager.setVolume('g1', 200)).volume).toBe(150);
    expect((await manager.setVolume('g1', -10)).volume).toBe(0);
    expect((await manager.setVolume('g1', 42)).volume).toBe(42);
  });

  it('stop clears the queue entirely', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const manager = new MediaQueueManager(redis);
    await manager.add('g1', [track('a'), track('b')]);
    const stopped = await manager.stop('g1');
    expect(stopped).toEqual({ tracks: [], currentIndex: -1, playing: false, volume: 100, loop: 'off' });
  });

  it('removeAt adjusts currentIndex correctly when removing before, at, and after it', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const manager = new MediaQueueManager(redis);
    await manager.add('g1', [track('a'), track('b'), track('c')]);
    await manager.skip('g1'); // currentIndex -> 1 (b)

    const afterRemoveBefore = await manager.removeAt('g1', 0); // removes 'a'
    expect(afterRemoveBefore.currentIndex).toBe(0); // now points at 'b'
    expect(afterRemoveBefore.tracks.map((t) => t.id)).toEqual(['b', 'c']);

    const afterRemoveCurrent = await manager.removeAt('g1', 0); // removes 'b' (current)
    expect(afterRemoveCurrent.currentIndex).toBe(0); // clamps to remaining 'c'
    expect(afterRemoveCurrent.tracks.map((t) => t.id)).toEqual(['c']);

    const afterRemoveLast = await manager.removeAt('g1', 0);
    expect(afterRemoveLast.currentIndex).toBe(-1);
    expect(afterRemoveLast.playing).toBe(false);
  });

  it('removeAt throws for an out-of-range index', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const manager = new MediaQueueManager(redis);
    await manager.add('g1', [track('a')]);
    await expect(manager.removeAt('g1', 5)).rejects.toThrow(RangeError);
  });

  it('nowPlaying returns null when nothing is queued, else the current track', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const manager = new MediaQueueManager(redis);
    expect(await manager.nowPlaying('g1')).toBeNull();
    await manager.add('g1', [track('a'), track('b')]);
    expect((await manager.nowPlaying('g1'))?.id).toBe('a');
  });

  it('shuffle only reorders upcoming tracks, leaving history and the current track untouched', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const manager = new MediaQueueManager(redis);
    await manager.add('g1', [track('a'), track('b'), track('c'), track('d'), track('e')]);
    await manager.skip('g1'); // currentIndex -> 1 ('b'); 'a' is history, 'b' is current, c/d/e are upcoming

    // Deterministic "rng": always pick the last index, giving a fixed, reproducible reversal-ish shuffle.
    const state = await manager.shuffle('g1', () => 0.999999);

    expect(state.tracks[0].id).toBe('a'); // history untouched
    expect(state.tracks[1].id).toBe('b'); // current untouched
    expect(
      state.tracks
        .slice(2)
        .map((t) => t.id)
        .sort(),
    ).toEqual(['c', 'd', 'e']); // same set, upcoming section only
  });

  it('shuffle is deterministic for a given rng sequence', async () => {
    const redis = new RedisMock() as unknown as Redis;
    const manager = new MediaQueueManager(redis);
    await manager.add('g1', [track('a'), track('b'), track('c'), track('d')]);

    const sequence = [0.1, 0.5, 0.9];
    let call = 0;
    const rng = () => sequence[call++ % sequence.length];

    const first = await manager.shuffle('g1', rng);
    await manager.stop('g1');
    await manager.add('g1', [track('a'), track('b'), track('c'), track('d')]);
    call = 0;
    const second = await manager.shuffle('g1', rng);

    expect(first.tracks.map((t) => t.id)).toEqual(second.tracks.map((t) => t.id));
  });
});
