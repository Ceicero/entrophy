'use client';

import { useParams } from 'next/navigation';
import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@entrophy/ui';
import { AnnouncementsTab } from '../../../../components/community/announcements-tab';
import { ChannelsTab } from '../../../../components/community/channels-tab';
import { EventsTab } from '../../../../components/community/events-tab';
import { GiveawaysTab } from '../../../../components/community/giveaways-tab';
import { OverviewTab } from '../../../../components/community/overview-tab';
import { PollsTab } from '../../../../components/community/polls-tab';
import { SuggestionsTab } from '../../../../components/community/suggestions-tab';

export default function CommunityPage() {
  const { guildId } = useParams<{ guildId: string }>();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Community"
        description="Polls, giveaways, the suggestion box, scheduled announcements, events, and channel automations."
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
          <TabsTrigger value="giveaways">Giveaways</TabsTrigger>
          <TabsTrigger value="polls">Polls</TabsTrigger>
          <TabsTrigger value="announcements">Announcements</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="channels">Channels</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab guildId={guildId} />
        </TabsContent>
        <TabsContent value="suggestions">
          <SuggestionsTab guildId={guildId} />
        </TabsContent>
        <TabsContent value="giveaways">
          <GiveawaysTab guildId={guildId} />
        </TabsContent>
        <TabsContent value="polls">
          <PollsTab guildId={guildId} />
        </TabsContent>
        <TabsContent value="announcements">
          <AnnouncementsTab guildId={guildId} />
        </TabsContent>
        <TabsContent value="events">
          <EventsTab guildId={guildId} />
        </TabsContent>
        <TabsContent value="channels">
          <ChannelsTab guildId={guildId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
