import { NextResponse, type NextRequest } from 'next/server';

/**
 * Conservative fast-redirect: only acts when we can trust the `sid` cookie to be visible on this
 * origin, which is only guaranteed when `COOKIE_DOMAIN` is a shared parent domain of the API and
 * dashboard (see docs/ARCHITECTURE.md §11, §21). Without that, cookies may be same-site-only on the
 * API origin and invisible here, so skip the check entirely and let the client-side auth gate
 * (`src/app/dashboard/layout.tsx`) handle it via `/auth/me`.
 */
export function middleware(request: NextRequest) {
  const cookieDomainConfigured = Boolean(process.env.COOKIE_DOMAIN);
  if (!cookieDomainConfigured) {
    return NextResponse.next();
  }

  const hasSession = request.cookies.has('sid');
  if (!hasSession && request.nextUrl.pathname.startsWith('/dashboard')) {
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
