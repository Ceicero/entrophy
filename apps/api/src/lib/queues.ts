import { Queue } from 'bullmq';
import type Redis from 'ioredis';

/** Shared queue names the dashboard enqueues jobs onto (ARCHITECTURE.md §10, §9's `bot-actions`). */
export const QUEUE_NAMES = {
  botActions: 'bot-actions',
  integrationsInbound: 'integrations:inbound',
  dataRequests: 'data-requests',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Minimal surface routes need from a queue — lets tests inject a lightweight fake instead of a real BullMQ `Queue`. */
export interface QueueLike {
  add(name: string, data: unknown, opts?: Record<string, unknown>): Promise<unknown>;
}

export interface QueueRegistryLike {
  get(name: string): QueueLike;
  botActions(): QueueLike;
  integrationsInbound(): QueueLike;
  dataRequests(): QueueLike;
}

/** Lazily-created, cached BullMQ `Queue` instances for the shared queue names, all sharing one Redis connection. */
export class QueueRegistry implements QueueRegistryLike {
  private readonly queues = new Map<string, Queue>();

  constructor(private readonly connection: Redis) {}

  /** Returns (creating if needed) the `Queue` for `name`. */
  get(name: string): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection: this.connection });
      this.queues.set(name, queue);
    }
    return queue;
  }

  botActions(): Queue {
    return this.get(QUEUE_NAMES.botActions);
  }

  integrationsInbound(): Queue {
    return this.get(QUEUE_NAMES.integrationsInbound);
  }

  dataRequests(): Queue {
    return this.get(QUEUE_NAMES.dataRequests);
  }

  /** Closes every created queue's connection; call on graceful shutdown. */
  async closeAll(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }
}
