'use client';

import { ChannelAutomationsCard } from './channel-automations-card';
import { StickyMessagesCard } from './sticky-messages-card';

/** Channels tab of the community page: per-channel automations. Each feature is its own card so sibling cards (sticky messages, auto-publish / auto-threads, stats channels) can slot in independently. */
export function ChannelsTab({ guildId }: { guildId: string }) {
  return (
    <div className="space-y-6">
      <StickyMessagesCard guildId={guildId} />
      <ChannelAutomationsCard guildId={guildId} />
    </div>
  );
}
