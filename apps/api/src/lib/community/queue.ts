// Talks directly to the `community` plugin's BullMQ queues so the dashboard can cancel a scheduled announcement
// (whether it's a one-off delayed job or a cron job scheduler) without depending on the shared QueueRegistry's
// narrower `QueueLike` interface (which only exposes `.add()`). Same Redis-backed queue name the bot process
// uses (`community:<jobName>`), so cancelling here reliably cancels the bot's scheduled job.
//
// The database write (`ScheduledAnnouncement.enabled = false`, done by the caller before this runs) is always
// the source of truth — `runAnnouncement` no-ops when `enabled` is false — so this is best-effort cleanup of
// the BullMQ side. It's bounded with a short timeout and never throws, so a slow/unavailable Redis (or, in
// tests, a Redis fake with no BullMQ-script support) can never block or fail the dashboard request.
import { Queue } from 'bullmq';
import type Redis from 'ioredis';

const QUEUE_OP_TIMEOUT_MS = 2000;

const queueCache = new Map<string, Queue>();

function communityQueue(redis: Redis, jobName: string): Queue {
  const key = `community.${jobName}`;
  const existing = queueCache.get(key);
  if (existing) return existing;
  const queue = new Queue(key, { connection: redis });
  queueCache.set(key, queue);
  return queue;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}

/** Cancels a scheduled announcement's BullMQ job: a repeatable scheduler for cron announcements, or a plain delayed job for one-off ones. Never throws. */
export async function cancelAnnouncementJob(
  redis: Redis,
  announcementId: string,
  cron: string | null,
): Promise<void> {
  try {
    const queue = communityQueue(redis, 'announcement-run');
    if (cron) {
      await withTimeout(queue.removeJobScheduler(`ann:${announcementId}`), QUEUE_OP_TIMEOUT_MS);
    } else {
      await withTimeout(queue.remove(`ann:${announcementId}`), QUEUE_OP_TIMEOUT_MS);
    }
  } catch {
    // Best-effort — see module doc comment above.
  }
}
