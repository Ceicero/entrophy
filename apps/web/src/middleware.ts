import { NextResponse, type NextRequest } from 'next/server';

/**
 * Fast-path for signed-out visitors to `/dashboard/*`: redirects at the edge before any client JS
 * runs, avoiding a flash of the loading skeleton. `app/dashboard/layout.tsx` does the same check
 * client-side via `useSession()` (`GET /auth/me`) and is authoritative — this is purely an
 * optimization layered in front of it, ported from the old `apps/dashboard/src/middleware.ts` as
 * part of the dashboard→web merge.
 *
 * Deliberately NOT ported: the old middleware's other half, which sent signed-out visitors to `/`
 * straight to Discord login. That made sense when `/` was exclusively the dashboard's login gate;
 * here `/` is the marketing homepage, so redirecting anonymous visitors away from it would be a
 * regression, not a fast-path.
 *
 * Conservative by design, same as the old middleware: only acts when `COOKIE_DOMAIN` is
 * configured, which is the only case where the `sid` cookie is guaranteed visible on this origin
 * (see docs/ARCHITECTURE.md §11, §21). And only in the "no cookie" direction — a *present* `sid`
 * cookie does not prove a still-valid session (it can be stale/expired server-side while the
 * browser still holds it), so this never redirects `/` → `/dashboard` on cookie presence alone;
 * only `dashboard/layout.tsx`'s `useSession()` is authoritative for that direction.
 */
export function middleware(request: NextRequest) {
  const cookieDomainConfigured = Boolean(process.env.COOKIE_DOMAIN);
  if (!cookieDomainConfigured) {
    return NextResponse.next();
  }

  const hasSession = request.cookies.has('sid');
  const { pathname } = request.nextUrl;

  if (!hasSession && pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
