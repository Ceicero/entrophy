import type { PluginJob } from '../../sdk';
import { getProvider } from '../providers';
import type { InboundWebhookEvent } from '../providers/types';

export interface InboundJobData {
  /** `apps/api/src/routes/webhooks.ts`'s queue payload provider tag — 'generic' for the generic inbound endpoint,
   * everything else matches a provider id 1:1. */
  provider: 'github' | 'stripe' | 'twitch' | 'generic';
  endpointId?: string;
  guildId?: string;
  eventType: string;
  payload: unknown;
}

const PROVIDER_ALIAS: Record<InboundJobData['provider'], string> = {
  github: 'github',
  stripe: 'stripe',
  twitch: 'twitch',
  generic: 'generic_webhook',
};

/** Processes the `integrations:inbound` queue: dispatches each API-verified webhook delivery to its provider's
 * `handleInbound`. Never throws (a bad/unexpected payload from one delivery must not retry-storm or crash the
 * worker) — errors are logged and the job resolves. */
export const inboundJob: PluginJob<InboundJobData> = {
  name: 'inbound',
  concurrency: 5,
  async processor(ctx, job) {
    const { provider: providerTag, endpointId, guildId, eventType, payload } = job.data;
    const providerId = PROVIDER_ALIAS[providerTag];
    const provider = getProvider(providerId);

    if (!provider?.handleInbound) {
      ctx.logger.warn(
        { provider: providerTag },
        'integrations: inbound event for a provider with no handleInbound',
      );
      return;
    }

    const event: InboundWebhookEvent = { eventType, payload, endpointId, guildId };
    try {
      await provider.handleInbound(ctx, null, event);
    } catch (err) {
      ctx.logger.error({ err, provider: providerTag, eventType }, 'integrations: inbound handler threw');
    }
  },
};
