'use client';

import { PageHeader, Card, CardContent } from '@entrophy/ui';
import { BrandWordmark } from '../components/brand-wordmark';
import { ThemeToggle } from '../components/theme-toggle';
import { useSession } from '../lib/session';

/**
 * Placeholder root page for this service (`app.entrophybot.com`). The per-guild config dashboard
 * that used to live here moved to `apps/web` (`entrophybot.com/dashboard/**`, see
 * `next.config.ts`'s `redirects()` for the compatibility redirect that sends old links there).
 * This service's job now is to host Brandon's upcoming owner-only ops console
 * (`dev.entrophybot.com`: cross-server support tickets, fleet metrics, error monitoring, bot
 * health) — real routes replace this page once that work starts.
 *
 * Kept intentionally honest/empty rather than faking ops content in the meantime. Session, theme,
 * and `@entrophy/ui` are exercised here on purpose (not just left wired but unused) so this stays
 * a verified, working baseline for that work instead of dead scaffolding.
 */
export default function RootPlaceholderPage() {
  const { status, user } = useSession();

  const sessionLabel =
    status === 'authenticated' && user
      ? `Signed in as ${user.globalName ?? user.username}`
      : status === 'loading'
        ? 'Checking session…'
        : 'Not signed in';

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center gap-6 p-6 text-center">
      <BrandWordmark />
      <PageHeader
        title="Entrophy ops console"
        description="Nothing here yet. This service will host the owner-only ops console: cross-server support tickets, fleet metrics, error monitoring, and bot health."
      />
      <Card className="w-full">
        <CardContent className="flex items-center justify-between gap-3 p-4 text-sm text-muted-foreground">
          <span>{sessionLabel}</span>
          <ThemeToggle />
        </CardContent>
      </Card>
    </div>
  );
}
