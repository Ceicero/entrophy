'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@entrophy/ui';
import { useSession } from '../lib/session';
import { API_BASE_URL } from '../lib/api';

/**
 * Dashboard root (`app.entrophybot.com/`). This never renders marketing content — that's
 * `apps/web` (entrophybot.com), a separate app on a separate domain. Anyone who lands here is
 * trying to get into the dashboard, so this sends them straight there instead of showing a
 * duplicate hero/feature list:
 *  - signed in  → `/dashboard` (the guild picker)
 *  - signed out → the same Discord OAuth login the old landing page's "Log in with Discord" CTA
 *    pointed at (`${API_BASE_URL}/auth/discord/login`) — reused as-is, not reinvented.
 *
 * In production, `src/middleware.ts` already redirects signed-out visitors straight to Discord
 * login at the edge (when `COOKIE_DOMAIN` is configured), so this component's effect never even
 * mounts for that case there. This client path is what actually runs: locally (no shared cookie
 * domain for the edge to check) for both directions, and in production for the signed-in
 * fast-path, which is deliberately *not* done in middleware — see its docstring for why (cookie
 * presence alone can't prove a still-valid session; only `GET /auth/me`, via `useSession()`, can).
 * While that check is in flight this renders the same loading skeleton `dashboard/layout.tsx`
 * uses, never the old marketing markup, so there's no flash of stale content either way.
 */
export default function DashboardRootRedirect() {
  const { status } = useSession();
  const router = useRouter();

  React.useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/dashboard');
    } else if (status === 'unauthenticated') {
      window.location.href = `${API_BASE_URL}/auth/discord/login`;
    }
  }, [status, router]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    </div>
  );
}
