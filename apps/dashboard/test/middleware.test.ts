import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../src/middleware';

function makeRequest(path: string, opts: { cookie?: string } = {}): NextRequest {
  return new NextRequest(`https://app.entrophybot.com${path}`, {
    headers: opts.cookie ? { cookie: opts.cookie } : {},
  });
}

describe('dashboard middleware', () => {
  const originalCookieDomain = process.env.COOKIE_DOMAIN;
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;

  afterEach(() => {
    if (originalCookieDomain === undefined) delete process.env.COOKIE_DOMAIN;
    else process.env.COOKIE_DOMAIN = originalCookieDomain;
    if (originalApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
  });

  describe('when COOKIE_DOMAIN is unset (local dev — sid not trustworthy on this origin)', () => {
    it('never redirects, for any path or cookie state, leaving it to the client-side session gate', () => {
      delete process.env.COOKIE_DOMAIN;

      for (const req of [
        makeRequest('/'),
        makeRequest('/', { cookie: 'sid=abc' }),
        makeRequest('/dashboard/123'),
        makeRequest('/dashboard/123', { cookie: 'sid=abc' }),
      ]) {
        const res = middleware(req);
        expect(res.headers.get('location')).toBeNull();
      }
    });
  });

  describe('when COOKIE_DOMAIN is configured (production — sid is trustworthy here)', () => {
    it('redirects a cookie-less /dashboard/* visit to /', () => {
      process.env.COOKIE_DOMAIN = '.entrophybot.com';
      const res = middleware(makeRequest('/dashboard/123'));
      expect(res.headers.get('location')).toBe('https://app.entrophybot.com/');
    });

    it('redirects a cookie-less root visit straight to Discord login (${API_BASE_URL}/auth/discord/login)', () => {
      process.env.COOKIE_DOMAIN = '.entrophybot.com';
      process.env.NEXT_PUBLIC_API_URL = 'https://api.entrophybot.com';
      const res = middleware(makeRequest('/'));
      expect(res.headers.get('location')).toBe('https://api.entrophybot.com/auth/discord/login');
    });

    it('falls back to the local API default when NEXT_PUBLIC_API_URL is unset', () => {
      process.env.COOKIE_DOMAIN = '.entrophybot.com';
      delete process.env.NEXT_PUBLIC_API_URL;
      const res = middleware(makeRequest('/'));
      expect(res.headers.get('location')).toBe('http://localhost:3001/auth/discord/login');
    });

    it('does NOT redirect /dashboard/* when a sid cookie is present, even though the session behind it is unverified here', () => {
      process.env.COOKIE_DOMAIN = '.entrophybot.com';
      const res = middleware(makeRequest('/dashboard/123', { cookie: 'sid=abc' }));
      expect(res.headers.get('location')).toBeNull();
    });

    it('does NOT redirect / to /dashboard on cookie presence alone — that would risk a bounce loop with a stale cookie', () => {
      process.env.COOKIE_DOMAIN = '.entrophybot.com';
      const res = middleware(makeRequest('/', { cookie: 'sid=abc' }));
      expect(res.headers.get('location')).toBeNull();
    });
  });
});
