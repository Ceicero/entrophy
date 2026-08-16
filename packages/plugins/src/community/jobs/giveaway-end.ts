import type { PluginJob } from '../../sdk';
import { finalizeGiveaway } from '../actions';

export interface GiveawayEndJobData {
  giveawayId: string;
}

export const giveawayEndJob: PluginJob<GiveawayEndJobData> = {
  name: 'giveaway-end',
  async processor(ctx, job) {
    await finalizeGiveaway(ctx, job.data.giveawayId);
  },
};
