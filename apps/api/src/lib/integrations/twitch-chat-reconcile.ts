import type { ZodFastifyInstance } from '../http';

/**
 * `bot-actions` job type for the Twitch-chat manager's on-demand reconcile. This constant is the API side of a
 * cross-agent contract with `apps/bot/src/host/bot-actions.ts`, which owns the matching dispatcher entry — the
 * exact string must stay `'twitchChat.reconcile'` on both sides.
 */
export const TWITCH_CHAT_RECONCILE_JOB_TYPE = 'twitchChat.reconcile' as const;

/**
 * Fire-and-forget nudge telling the bot process to reconcile Twitch chat channel subscriptions right away,
 * instead of waiting for its next per-minute tick (ARCHITECTURE.md §J/§19). Call this after every dashboard
 * mutation that changes what the bot should be doing: the channel link itself (connect/enable/prefix/delete),
 * its commands/timers, or the shared bot identity.
 *
 * The reconcile walks every enabled `TwitchChatChannel` row globally, so `guildId` is informational only (it
 * shows up in job data/logs, nothing more) — pass `''` from routes that aren't guild-scoped, like the owner-only
 * bot identity routes.
 *
 * A queue hiccup here must never fail the mutation that triggered it (the next minute tick is still the
 * fallback if this never lands), so failures are only logged, never thrown — mirrors `integrations.ts`'s
 * `integrations.testWebhook` enqueue, minus the `await`/response coupling since nothing here depends on the
 * job actually landing.
 */
export function nudgeTwitchChatReconcile(app: ZodFastifyInstance, guildId: string): void {
  app.queues
    .botActions()
    .add(TWITCH_CHAT_RECONCILE_JOB_TYPE, { type: TWITCH_CHAT_RECONCILE_JOB_TYPE, guildId })
    .catch((err: unknown) => {
      app.log.warn({ err, guildId }, 'failed to enqueue twitchChat.reconcile nudge');
    });
}
