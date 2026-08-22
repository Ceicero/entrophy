'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge } from '@entrophy/ui';
import { NAV, isNavItemActive, isNavItemDisabled } from './nav';
import { usePlugins } from '../lib/queries';

export interface DashboardTabStripProps {
  guildId: string;
}

/**
 * Below-`lg` companion to `AppSidebar`: the `<aside>` in `Sidebar` (packages/ui) is
 * `hidden ... lg:flex`, so under the `lg` breakpoint the sidebar disappears entirely and the
 * hamburger becomes the only way to navigate — easy to miss on a narrow window. This renders
 * the same `NAV` list as a persistent, horizontally-scrollable tab strip so every section stays
 * reachable without opening the menu. Hidden at `lg` and above, where the sidebar takes over.
 */
export function DashboardTabStrip({ guildId }: DashboardTabStripProps) {
  const pathname = usePathname();
  const { data: plugins } = usePlugins(guildId);
  const activeRef = React.useRef<HTMLAnchorElement>(null);

  // Scroll the active tab into view on load so the current section is visible without the
  // visitor having to manually scroll the strip (e.g. landing deep in the nav on a phone).
  React.useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, []);

  return (
    <nav aria-label="Dashboard sections" className="border-b border-border bg-card lg:hidden">
      <div className="flex gap-1 overflow-x-auto px-3 py-2">
        {NAV.map((item) => {
          const href = item.href(guildId);
          const active = isNavItemActive(pathname, href);
          const disabled = isNavItemDisabled(item, plugins);

          return (
            <Link
              key={href}
              ref={active ? activeRef : undefined}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 ${
                active
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <item.icon />
              {item.label}
              {disabled ? (
                <Badge variant="outline" className="text-[10px]">
                  Off
                </Badge>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
