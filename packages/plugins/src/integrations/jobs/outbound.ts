import type { PluginJob } from '../../sdk';
import { attemptOutboundDelivery } from '../delivery';

export interface OutboundJobData {
  endpointId: string;
  guildId: string;
  payload: unknown;
  attempt?: number;
}

/**
 * Processes the `integrations:outbound` queue (ARCHITECTURE.md's integrations connector spec): one HTTP delivery
 * attempt per job run. Throwing on failure is deliberate — it's what makes BullMQ's own `attempts`/`backoff`
 * (set when the job was added, see `signing.ts`'s `OUTBOUND_JOB_OPTIONS`) actually retry it; `attemptOutboundDelivery`
 * already recorded the `WebhookDelivery` row and updated `failureCount`/auto-disable/`webhook.deliveryFailed`
 * before this throws, so nothing is lost even on the final exhausted attempt.
 */
export const outboundJob: PluginJob<OutboundJobData> = {
  name: 'outbound',
  concurrency: 5,
  async processor(ctx, job) {
    const { endpointId, guildId, payload } = job.data;
    const endpoint = await ctx.prisma.webhookEndpoint.findFirst({
      where: { id: endpointId, guildId, direction: 'OUTBOUND', deletedAt: null },
    });
    if (!endpoint) {
      ctx.logger.warn(
        { endpointId, guildId },
        'integrations: outbound job for a missing/deleted endpoint, dropping',
      );
      return;
    }
    if (!endpoint.enabled) {
      ctx.logger.info(
        { endpointId, guildId },
        'integrations: outbound job for a disabled endpoint, dropping',
      );
      return;
    }

    const attempt = job.attemptsMade + 1;
    const result = await attemptOutboundDelivery(ctx, endpoint, payload, attempt);
    if (!result.delivered) {
      throw new Error(result.error ?? 'Outbound delivery failed.');
    }
  },
};
