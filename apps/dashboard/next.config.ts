import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

/**
 * `output: 'standalone'` is what the Docker image consumes (ARCHITECTURE.md §14) and is the default on every
 * Linux/macOS host (CI, Docker, Railway). Next's standalone file-tracing step recreates pnpm's symlinked
 * node_modules layout with real symlinks, which Windows only permits when Developer Mode /
 * SeCreateSymbolicLinkPrivilege is enabled — so on win32 dev machines we fall back to a regular build.
 * Set NEXT_OUTPUT_STANDALONE=true|false to force either behaviour explicitly.
 */
function useStandaloneOutput(): boolean {
  const forced = process.env.NEXT_OUTPUT_STANDALONE;
  if (forced === 'true') return true;
  if (forced === 'false') return false;
  return process.platform !== 'win32';
}

const monorepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const nextConfig: NextConfig = {
  transpilePackages: ['@entrophy/ui', '@entrophy/types'],
  ...(useStandaloneOutput() ? { output: 'standalone' as const } : {}),
  // Trace files from the workspace root so the standalone bundle includes hoisted workspace deps and
  // lands at .next/standalone/apps/dashboard/server.js (what Dockerfile.dashboard's CMD expects).
  outputFileTracingRoot: monorepoRoot,
  reactStrictMode: true,
  // The per-guild config dashboard that used to live on this service moved to apps/web
  // (entrophybot.com/dashboard/**). These two redirects are deliberately path-scoped, NOT a
  // blanket catch-all: bookmarks, the Top.gg listing, and a live Reddit post point at
  // app.entrophybot.com/dashboard/... and must keep resolving, but this service is also going to
  // host an owner-only ops console on a separate domain (dev.entrophybot.com) next. A wildcard
  // redirect here would swallow those future /ops/... routes too, so only the two path families
  // that actually used to be served here are redirected — everything else (e.g. `/`'s
  // placeholder today, `/ops/...` later) falls through to this app normally.
  async redirects() {
    // Falls back to the web app's local dev URL (not the production domain — see .env.example),
    // so running this service locally without WEB_URL set never bounces `/` off to the real site.
    const target = (process.env.WEB_URL ?? 'http://localhost:3003').replace(/\/+$/, '');
    return [
      { source: '/', destination: target, permanent: true },
      { source: '/dashboard', destination: `${target}/dashboard`, permanent: true },
      { source: '/dashboard/:path*', destination: `${target}/dashboard/:path*`, permanent: true },
    ];
  },
};

export default nextConfig;
