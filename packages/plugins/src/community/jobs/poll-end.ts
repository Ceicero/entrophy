import type { PluginJob } from '../../sdk';
import { closePoll } from '../actions';

export interface PollEndJobData {
  pollId: string;
}

export const pollEndJob: PluginJob<PollEndJobData> = {
  name: 'poll-end',
  async processor(ctx, job) {
    await closePoll(ctx, job.data.pollId);
  },
};
