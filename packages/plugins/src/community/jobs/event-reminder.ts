import type { PluginJob } from '../../sdk';
import { fireEventReminder } from '../actions';

export interface EventReminderJobData {
  eventId: string;
  minutesBefore: number;
}

export const eventReminderJob: PluginJob<EventReminderJobData> = {
  name: 'event-reminder',
  async processor(ctx, job) {
    await fireEventReminder(ctx, job.data.eventId, job.data.minutesBefore);
  },
};
