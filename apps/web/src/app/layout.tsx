import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Entrophy',
  description: 'Entrophy — the modular, compliance-first Discord bot. Ignite that passion again.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
