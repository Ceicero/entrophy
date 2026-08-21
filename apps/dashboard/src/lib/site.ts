// Small, dependency-free environment helpers for the dashboard, mirroring `apps/web/src/lib/site.ts`
// (ARCHITECTURE.md §17). Next.js inlines every `NEXT_PUBLIC_*` reference into both the server and
// client bundles at build time.

/** Optional public support/community server invite link. `null` when not configured — callers hide
 * the link (same contract as the website's footer). */
export function supportServerUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPPORT_SERVER_URL;
  return url && url.trim().length > 0 ? url : null;
}
