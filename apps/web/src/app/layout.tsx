import type { Metadata } from 'next';
import './globals.css';
import { Smoke } from '../components/Smoke';
import { Grain } from '../components/Grain';
import { Nav } from '../components/Nav';
import { Footer } from '../components/Footer';
import { SITE_URL } from '../lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Entrophy — Discord moderation you can trust', template: '%s · Entrophy' },
  description:
    'Entrophy is a modular, compliance-first Discord bot: moderation, automod, a policy-driven Enforcer, tickets, roles, leveling, and more. Never Administrator. Everything logged.',
  applicationName: 'Entrophy',
  openGraph: {
    type: 'website',
    siteName: 'Entrophy',
    title: 'Entrophy — Discord moderation you can trust',
    description: 'A modular, compliance-first Discord bot built for gaming communities. Never Administrator. Everything logged.',
    url: SITE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Entrophy — Discord moderation you can trust',
    description: 'A modular, compliance-first Discord bot built for gaming communities.',
  },
  icons: {
    icon: '/icon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-ink-0 text-grey-7 antialiased">
        <Smoke />
        <Grain />
        <div className="site-content flex min-h-dvh flex-col">
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-paper focus:px-4 focus:py-2 focus:text-ink-0"
          >
            Skip to content
          </a>
          <Nav />
          <main id="main-content" className="flex-1">
            {children}
          </main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
