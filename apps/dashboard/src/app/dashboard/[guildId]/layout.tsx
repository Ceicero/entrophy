'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { AppSidebar } from '../../../components/app-sidebar';
import { DashboardTabStrip } from '../../../components/dashboard-tab-strip';
import { TopBar } from '../../../components/top-bar';

/** Sidebar + top bar shell wrapping every `/dashboard/[guildId]/*` page. */
export default function GuildLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ guildId: string }>();
  const guildId = params.guildId;
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="flex min-h-dvh">
      <AppSidebar guildId={guildId} mobileOpen={mobileOpen} onMobileOpenChange={setMobileOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenuClick={() => setMobileOpen(true)} />
        <DashboardTabStrip guildId={guildId} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
