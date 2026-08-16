import type { PluginJob } from '../../sdk';
import { deliverReminder } from '../actions';

export interface ReminderDeliverJobData {
  reminderId: string;
}

export const reminderDeliverJob: PluginJob<ReminderDeliverJobData> = {
  name: 'reminder-deliver',
  async processor(ctx, job) {
    await deliverReminder(ctx, job.data.reminderId);
  },
};
