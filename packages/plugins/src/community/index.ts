import { definePlugin, registerPluginLocales } from '../sdk';
import { manifest } from './manifest';
import { command as pollCommand } from './commands/poll';
import { command as giveawayCommand } from './commands/giveaway';
import { command as suggestCommand } from './commands/suggest';
import { command as suggestionsCommand } from './commands/suggestions';
import { command as announceCommand } from './commands/announce';
import { command as remindCommand } from './commands/remind';
import { command as eventCommand } from './commands/event';
import { command as stickyCommand } from './commands/sticky';
import { pollComponents } from './components/poll';
import { giveawayComponents } from './components/giveaway';
import { suggestionComponents } from './components/suggestion';
import { eventComponents } from './components/event';
import { stickyComponents } from './components/sticky';
import { stickyMessageCreateHandler } from './events/sticky';
import { pollEndJob } from './jobs/poll-end';
import { giveawayEndJob } from './jobs/giveaway-end';
import { announcementRunJob } from './jobs/announcement-run';
import { reminderDeliverJob } from './jobs/reminder-deliver';
import { reminderSweepJob } from './jobs/reminder-sweep';
import { eventReminderJob } from './jobs/event-reminder';
import { suggestionSyncJob } from './jobs/suggestion-sync';
import { stickyRepostJob } from './jobs/sticky-repost';
import en from './locales/en.json';

// Registers the `community` locale bundle (see admin/index.ts for the same pattern).
registerPluginLocales('community', { en });

export const plugin = definePlugin({
  manifest,
  commands: [
    pollCommand,
    giveawayCommand,
    suggestCommand,
    suggestionsCommand,
    announceCommand,
    remindCommand,
    eventCommand,
    stickyCommand,
  ],
  events: [stickyMessageCreateHandler],
  components: [
    ...pollComponents,
    ...giveawayComponents,
    ...suggestionComponents,
    ...eventComponents,
    ...stickyComponents,
  ],
  jobs: [
    pollEndJob,
    giveawayEndJob,
    announcementRunJob,
    reminderDeliverJob,
    reminderSweepJob,
    eventReminderJob,
    suggestionSyncJob,
    stickyRepostJob,
  ],
  async health() {
    return { status: 'ok' };
  },
});

export default plugin;
