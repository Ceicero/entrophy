'use client';

import { useParams } from 'next/navigation';
import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@entrophy/ui';
import { OverviewTab } from '../../../../components/enforcer/overview-tab';
import { PoliciesTab } from '../../../../components/enforcer/policies-tab';
import { QueueTab } from '../../../../components/enforcer/queue-tab';
import { LedgerTab } from '../../../../components/enforcer/ledger-tab';
import { SettingsTab } from '../../../../components/enforcer/settings-tab';

export default function EnforcerPage() {
  const { guildId } = useParams<{ guildId: string }>();

  return (
    <div className="space-y-6">
      <PageHeader title="Enforcer" description="Policy-driven, hands-off moderation: flag, decide, and keep an immutable ledger." />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="queue">Queue</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab guildId={guildId} />
        </TabsContent>
        <TabsContent value="policies">
          <PoliciesTab guildId={guildId} />
        </TabsContent>
        <TabsContent value="queue">
          <QueueTab guildId={guildId} />
        </TabsContent>
        <TabsContent value="ledger">
          <LedgerTab guildId={guildId} />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab guildId={guildId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
