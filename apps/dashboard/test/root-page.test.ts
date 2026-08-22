import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Read the raw source rather than importing the component: it's a 'use client' component that
// calls useSession() (throws outside a SessionProvider) and this app's test setup has no
// jsdom/React Testing Library (see apps/dashboard/vitest.config.ts), so it can't be rendered here.
// A plain text check is still a meaningful regression guard for "no marketing, no hardcoded logo,
// redirects to the right places" — see apps/dashboard/test/nav.test.ts for the same source-text
// convention used elsewhere in this app's tests.
const pageSrc = readFileSync(fileURLToPath(new URL('../src/app/page.tsx', import.meta.url)), 'utf8');

describe('dashboard root page (src/app/page.tsx)', () => {
  it('does not import the generic Sparkles icon or any other lucide-react icon as a logo stand-in', () => {
    expect(pageSrc).not.toContain('lucide-react');
    expect(pageSrc).not.toContain('Sparkles');
  });

  it('does not render the old duplicate marketing copy (hero, feature list, footer tagline)', () => {
    expect(pageSrc).not.toContain('modular, compliance-first Discord bot platform');
    expect(pageSrc).not.toContain('Moderation with receipts');
    expect(pageSrc).not.toContain('least-privilege by default');
    expect(pageSrc).not.toContain('Add to a server');
  });

  it('sends a signed-in visitor to /dashboard rather than rendering anything of its own', () => {
    expect(pageSrc).toMatch(/status === 'authenticated'/);
    expect(pageSrc).toContain("router.replace('/dashboard')");
  });

  it('sends a signed-out visitor to the same Discord login the old CTA used, not a client-rendered form', () => {
    expect(pageSrc).toMatch(/status === 'unauthenticated'/);
    expect(pageSrc).toContain('${API_BASE_URL}/auth/discord/login');
  });

  it('reads the API base URL from the shared api client rather than hardcoding a host', () => {
    expect(pageSrc).toContain("from '../lib/api'");
  });
});
