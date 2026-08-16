'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@entrophy/ui';
import { useSession } from '../../lib/session';

/** Auth gate for the entire `/dashboard` tree: redirects unauthenticated visitors to the landing page. */
export default function DashboardRootLayout({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();

  React.useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/');
    }
  }, [status, router]);

  if (status === 'loading') {
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

  if (status === 'unauthenticated') {
    return null;
  }

  return <>{children}</>;
}
