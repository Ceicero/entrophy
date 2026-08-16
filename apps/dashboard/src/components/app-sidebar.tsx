'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sidebar, SidebarNavItem, SidebarSection, Badge } from '@entrophy/ui';
import { NAV } from './nav';
import { BrandWordmark } from './brand-wordmark';
import { GuildSwitcher } from './guild-switcher';
import { usePlugins } from '../lib/queries';

export interface AppSidebarProps {
  guildId: string;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

/** Per-guild dashboard sidebar: guild switcher + the static nav from `NAV`, dimming plugin sections that are disabled. */
export function AppSidebar({ guildId, mobileOpen, onMobileOpenChange }: AppSidebarProps) {
  const pathname = usePathname();
  const { data: plugins } = usePlugins(guildId);

  return (
    <Sidebar
      mobileOpen={mobileOpen}
      onMobileOpenChange={onMobileOpenChange}
      header={
        <div className="flex flex-col gap-3">
          <BrandWordmark />
          <GuildSwitcher currentGuildId={guildId} />
        </div>
      }
    >
      <SidebarSection>
        {NAV.map((item) => {
          const href = item.href(guildId);
          const active = pathname === href;
          const plugin = item.pluginId ? plugins?.find((p) => p.id === item.pluginId) : undefined;
          const disabled = plugin ? !plugin.enabled : false;

          return (
            <SidebarNavItem
              key={href}
              asChild
              active={active}
              icon={<item.icon />}
              suffix={
                disabled ? (
                  <Badge variant="outline" className="text-[10px]">
                    Off
                  </Badge>
                ) : undefined
              }
            >
              <Link href={href} onClick={() => onMobileOpenChange(false)}>
                {item.label}
              </Link>
            </SidebarNavItem>
          );
        })}
      </SidebarSection>
    </Sidebar>
  );
}
