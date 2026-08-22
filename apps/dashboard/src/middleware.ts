import { NextResponse, type NextRequest } from 'next/server';

/**
 * Builds the Discord login URL the dashboard root redirects signed-out visitors to — the exact
 * same `${API_BASE_URL}/auth/discord/login` the old landing page's CTA linked to (`src/app/page.tsx`).
 * `NEXT_PUBLIC_API_URL` is the same env var `src/lib/api.ts` reads for the client-side `apiFetch`
 * base; Next inlines `NEXT_PUBLIC_*` reads for both the client bundle and this Edge middleware
 * bundle, so no special handling is needed to read it here.
 */
function discordLoginUrl(): string {
  const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
  return `${apiBase}/auth/discord/login`;
}

/**
 * Conservative fast-redirect: only acts when we can trust the `sid` cookie to be visible on this
 * origin, which is only guaranteed when `COOKIE_DOMAIN` is a shared parent domain of the API and
 * dashboard (see docs/ARCHITECTURE.md §11, §21). Without that, cookies may be same-site-only on the
 * API origin and invisible here, so skip the check entirely and let the client-side auth gate
 * (`src/app/dashboard/layout.tsx`, `src/app/page.tsx`) handle it via `/auth/me`.
 *
 * Deliberately asymmetric between the two directions:
 *  - No `sid` cookie reliably means "not signed in", so it's safe to bounce `/dashboard/*` back to
 *    `/`, and to send `/` itself straight to Discord login without waiting for a page to mount.
 *  - A *present* `sid` cookie does NOT reliably mean "signed in" — the session it names can have
 *    expired or been cleared server-side (Redis) while the browser still holds the cookie. So this
 *    never redirects `/` → `/dashboard` on cookie presence alone; that direction is left to
 *    `src/app/page.tsx`'s `useSession()` check (`GET /auth/me`), which is authoritative. Redirecting
 *    here on presence alone would risk a loop: a stale-cookie visitor sent to `/dashboard` gets
 *    bounced back to `/` by its layout's auth gate, and this middleware would immediately send them
 *    right back to `/dashboard` again.
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

  if (!hasSession && pathname === '/') {
    return NextResponse.redirect(discordLoginUrl());
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/'],
};
