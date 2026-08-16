import {
  LayoutDashboard,
  Puzzle,
  Gavel,
  ShieldAlert,
  Scale,
  ScrollText,
  LifeBuoy,
  UsersRound,
  TrendingUp,
  PartyPopper,
  Plug,
  Bot,
  BarChart3,
  History,
  Lock,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import type { PluginId } from '@entrophy/types';

export interface NavItem {
  href: (guildId: string) => string;
  label: string;
  icon: LucideIcon;
  /** When set, the sidebar shows a muted dot/badge if this plugin is disabled for the current guild. */
  pluginId?: PluginId;
}

/** Static per-guild nav, one entry per route in docs/ARCHITECTURE.md §11. */
export const NAV: NavItem[] = [
  { href: (id) => `/dashboard/${id}`, label: 'Overview', icon: LayoutDashboard },
  { href: (id) => `/dashboard/${id}/plugins`, label: 'Plugins', icon: Puzzle },
  { href: (id) => `/dashboard/${id}/moderation`, label: 'Moderation', icon: Gavel, pluginId: 'moderation' },
  { href: (id) => `/dashboard/${id}/automod`, label: 'Automod', icon: ShieldAlert, pluginId: 'automod' },
  { href: (id) => `/dashboard/${id}/enforcer`, label: 'Enforcer', icon: Scale, pluginId: 'enforcer' },
  { href: (id) => `/dashboard/${id}/logging`, label: 'Logging', icon: ScrollText, pluginId: 'logging' },
  { href: (id) => `/dashboard/${id}/tickets`, label: 'Tickets', icon: LifeBuoy, pluginId: 'tickets' },
  { href: (id) => `/dashboard/${id}/roles`, label: 'Roles', icon: UsersRound, pluginId: 'roles' },
  {
    href: (id) => `/dashboard/${id}/engagement`,
    label: 'Engagement',
    icon: TrendingUp,
    pluginId: 'engagement',
  },
  {
    href: (id) => `/dashboard/${id}/community`,
    label: 'Community',
    icon: PartyPopper,
    pluginId: 'community',
  },
  {
    href: (id) => `/dashboard/${id}/integrations`,
    label: 'Integrations',
    icon: Plug,
    pluginId: 'integrations',
  },
  { href: (id) => `/dashboard/${id}/ai`, label: 'AI Assistant', icon: Bot, pluginId: 'ai' },
  { href: (id) => `/dashboard/${id}/analytics`, label: 'Analytics', icon: BarChart3 },
  { href: (id) => `/dashboard/${id}/audit`, label: 'Audit log', icon: History },
  { href: (id) => `/dashboard/${id}/privacy`, label: 'Privacy', icon: Lock },
  { href: (id) => `/dashboard/${id}/settings`, label: 'Settings', icon: Settings },
];
