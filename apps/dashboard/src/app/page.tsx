'use client';

import Link from 'next/link';
import { ShieldCheck, Gavel, Boxes, ScrollText, Sparkles } from 'lucide-react';
import { Button } from '@entrophy/ui';
import { useSession } from '../lib/session';
import { API_BASE_URL } from '../lib/api';

const FEATURES = [
  {
    icon: Gavel,
    title: 'Moderation with receipts',
    body: 'Case IDs, hierarchy checks, and an admin enforcer that keeps every action bookkept and appealable.',
  },
  {
    icon: ShieldCheck,
    title: 'Compliance by default',
    body: 'Least-privilege permissions, privacy-first defaults, and every config change audit-logged.',
  },
  {
    icon: Boxes,
    title: 'Modular plugins',
    body: 'Enable exactly what your server needs — moderation, tickets, roles, engagement, and more — per guild.',
  },
  {
    icon: ScrollText,
    title: 'A transparent audit trail',
    body: 'Every configuration change and plugin toggle is logged and searchable from this dashboard.',
  },
];

export default function LandingPage() {
  const { status } = useSession();

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col px-6">
      <header className="flex items-center justify-between py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="text-lg font-semibold">Entrophy</span>
        </div>
        {status === 'authenticated' ? (
          <Button asChild>
            <Link href="/dashboard">Open dashboard</Link>
          </Button>
        ) : null}
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-6 py-20 text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          A modular, compliance-first Discord bot platform
        </h1>
        <p className="max-w-2xl text-balance text-muted-foreground sm:text-lg">
          Entrophy gives your server moderation, automod, tickets, roles, engagement, and an admin enforcer
          workflow — all configurable per guild, all logged, none of it hidden from you.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {status === 'authenticated' ? (
            <Button size="lg" asChild>
              <Link href="/dashboard">Open dashboard</Link>
            </Button>
          ) : (
            <Button size="lg" asChild>
              <a href={`${API_BASE_URL}/auth/discord/login`}>Log in with Discord</a>
            </Button>
          )}
          <Button size="lg" variant="outline" asChild>
            <a href={`${API_BASE_URL}/auth/invite`}>Add to a server</a>
          </Button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 pb-20 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div key={f.title} className="flex gap-4 rounded-lg border border-border p-5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
              <f.icon className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-medium">{f.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          </div>
        ))}
      </section>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Entrophy — least-privilege by default, never Administrator.
      </footer>
    </main>
  );
}
