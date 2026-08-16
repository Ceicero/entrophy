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
};

export default nextConfig;
