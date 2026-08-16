import type { PluginJob } from '../../sdk';
import { runAnnouncement } from '../actions';

export interface AnnouncementRunJobData {
  announcementId: string;
}

export const announcementRunJob: PluginJob<AnnouncementRunJobData> = {
  name: 'announcement-run',
  async processor(ctx, job) {
    await runAnnouncement(ctx, job.data.announcementId);
  },
};
