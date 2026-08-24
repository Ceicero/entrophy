import type { PluginJob } from '../../sdk';
import { getBotAccessToken } from '../twitch-chat/helix';
import type { TwitchChatManager } from '../twitch-chat/manager';
import { fireDueTimers } from '../twitch-chat/timers';

/**
 * Every minute: (1) makes sure the bot identity's Helix token is fresh (refreshing it here means a chat message
 * arriving mid-minute never has to wait on a refresh), (2) nudges the manager's reconcile loop — which is also
 * how it notices env/bot-identity became available after being idle, or recovers from a dead socket the backoff
 * timer hasn't retried yet — and (3) fires any due timers. The manager's own socket lifecycle (connect/backoff/
 * reconnect) is NOT driven by this job; this only reconciles subscriptions against whatever socket state exists
 * right now (per plugin-runtime spec's "the manager's socket lifecycle is NOT a job").
 */
export function createTwitchChatTickJob(manager: TwitchChatManager): PluginJob {
  return {
    name: 'twitch-chat-tick',
    repeat: { pattern: '* * * * *' },
    concurrency: 1,
    async processor(ctx) {
      await getBotAccessToken(ctx).catch((err: unknown) => {
        ctx.logger.warn({ err }, 'integrations/twitch-chat: token freshness check failed');
      });
      await manager.reconcile(ctx).catch((err: unknown) => {
        ctx.logger.error({ err }, 'integrations/twitch-chat: reconcile failed');
      });
      await fireDueTimers(ctx, manager).catch((err: unknown) => {
        ctx.logger.error({ err }, 'integrations/twitch-chat: fireDueTimers failed');
      });
    },
  };
}
