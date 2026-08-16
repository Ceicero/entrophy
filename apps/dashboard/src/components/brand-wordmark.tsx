'use client';

import { useState } from 'react';

/**
 * Sidebar brand mark: the skull logo synced from `assets/brand/` (ARCHITECTURE.md §22) into
 * `public/brand/entrophy-skull.jpg` by `scripts/sync-brand.mjs`, falling back to a plain text wordmark when the
 * image 404s (e.g. the sync script hasn't run, or the source asset is missing).
 */
export function BrandWordmark() {
  const [imageFailed, setImageFailed] = useState(false);

  if (imageFailed) {
    return <span className="text-sm font-semibold tracking-wide text-foreground">Entrophy</span>;
  }

  return (
    // Plain <img>, not next/image: the brand asset is synced at build/dev time (or absent) by scripts/sync-brand.mjs,
    // so its dimensions/existence aren't known statically the way next/image requires.
    <img
      src="/brand/entrophy-skull.jpg"
      alt="Entrophy"
      className="h-7 w-7 rounded-md object-cover"
      onError={() => setImageFailed(true)}
    />
  );
}
