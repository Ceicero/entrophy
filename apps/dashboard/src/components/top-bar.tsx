'use client';

import { Menu, LogOut, User as UserIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
} from '@entrophy/ui';
import { ThemeToggle } from './theme-toggle';
import { useSession } from '../lib/session';

export interface TopBarProps {
  title?: string;
  onMenuClick: () => void;
}

/** Sticky top bar shown above every `[guildId]` page: mobile menu button, theme toggle, user menu. */
export function TopBar({ title, onMenuClick }: TopBarProps) {
  const { user, logout } = useSession();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <IconButton label="Open menu" variant="ghost" className="lg:hidden" onClick={onMenuClick}>
        <Menu className="h-5 w-5" />
      </IconButton>
      {title ? <h2 className="truncate text-sm font-medium text-muted-foreground">{title}</h2> : null}
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-ring">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                <UserIcon className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="truncate">
              {user?.globalName ?? user?.username ?? 'Account'}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void logout()}>
              <LogOut className="h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
