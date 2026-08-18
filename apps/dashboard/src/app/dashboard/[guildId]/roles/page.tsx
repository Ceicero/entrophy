'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import type { RoleGroupDto } from '@entrophy/types/roles';
import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@entrophy/ui';
import { AutoRolesTab } from '../../../../components/roles/autoroles-tab';
import { GroupsTab } from '../../../../components/roles/groups-tab';
import { OnboardingTab } from '../../../../components/roles/onboarding-tab';
import { PanelsTab } from '../../../../components/roles/panels-tab';
import { PersistenceTab } from '../../../../components/roles/persistence-tab';
import { VerificationTab } from '../../../../components/roles/verification-tab';
import { WelcomeGoodbyeTab } from '../../../../components/roles/welcome-goodbye-tab';

export default function RolesPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [groups, setGroups] = React.useState<RoleGroupDto[]>([]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles &amp; Onboarding"
        description="Role panel builder, welcome/goodbye embeds, onboarding, verification, role persistence, and auto-roles."
      />

      <Tabs defaultValue="panels">
        <TabsList>
          <TabsTrigger value="panels">Panels</TabsTrigger>
          <TabsTrigger value="groups">Groups</TabsTrigger>
          <TabsTrigger value="welcome">Welcome &amp; Goodbye</TabsTrigger>
          <TabsTrigger value="verification">Verification</TabsTrigger>
          <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
          <TabsTrigger value="persistence">Persistence</TabsTrigger>
          <TabsTrigger value="autoroles">Auto-roles</TabsTrigger>
        </TabsList>

        <TabsContent value="panels">
          <PanelsTab guildId={guildId} groups={groups} />
        </TabsContent>
        <TabsContent value="groups">
          <GroupsTab guildId={guildId} onGroupsChange={setGroups} />
        </TabsContent>
        <TabsContent value="welcome">
          <WelcomeGoodbyeTab guildId={guildId} />
        </TabsContent>
        <TabsContent value="verification">
          <VerificationTab guildId={guildId} />
        </TabsContent>
        <TabsContent value="onboarding">
          <OnboardingTab guildId={guildId} />
        </TabsContent>
        <TabsContent value="persistence">
          <PersistenceTab guildId={guildId} />
        </TabsContent>
        <TabsContent value="autoroles">
          <AutoRolesTab guildId={guildId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
