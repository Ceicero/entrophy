#!/usr/bin/env node
// Syncs the brand logo from assets/brand/ into each app's public/brand/ (ARCHITECTURE.md §22). Run automatically
// as predev/prebuild for apps/web and apps/dashboard, and manually via `pnpm brand:sync`. Never throws — a
// missing source asset is a no-op (features that reference the logo degrade gracefully, per §22) so this script
// can never fail a build.
import { copyFile, mkdir, writeFile, access, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = join(REPO_ROOT, 'assets', 'brand');
// PNG (lossless) takes precedence over JPG if both exist, per ARCHITECTURE.md §22.
const CANDIDATES = ['entrophy-skull.png', 'entrophy-skull.jpg'];
const TARGET_DIRS = [
  join(REPO_ROOT, 'apps', 'web', 'public', 'brand'),
  join(REPO_ROOT, 'apps', 'dashboard', 'public', 'brand'),
];
// The web app's `Logo` component statically imports this copy of the manifest (same pattern as the generated
// `src/data/commands.json` / `src/data/invite.json`) so the logo path is known at build time in every
// environment, including the Docker standalone runner where `public/` isn't readable via relative fs paths from
// compiled server code. Kept byte-identical to `apps/web/public/brand/manifest.json`.
const WEB_DATA_MANIFEST = join(REPO_ROOT, 'apps', 'web', 'src', 'data', 'brand.json');
// Next's `apple-icon` static-file convention (ARCHITECTURE.md §22) — written with whatever extension the source
// actually has (`.png`/`.jpg`) rather than always `.png`, so the served content-type always matches the bytes.
const WEB_APPLE_ICON_DIR = join(REPO_ROOT, 'apps', 'web', 'src', 'app');
const APPLE_ICON_EXTENSIONS = ['png', 'jpg', 'jpeg'];

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findSourceFile() {
  for (const name of CANDIDATES) {
    const path = join(SOURCE_DIR, name);
    if (await fileExists(path)) {
      return { path, name };
    }
  }
  return null;
}

async function syncToTarget(targetDir, source) {
  await mkdir(targetDir, { recursive: true });
  if (!source) {
    // No-op: leave any previously-synced file in place, but still write a manifest that reflects reality so
    // pages can check it rather than guessing from a stale file.
    await writeFile(join(targetDir, 'manifest.json'), JSON.stringify({ logo: null }, null, 2) + '\n', 'utf8');
    return;
  }
  await copyFile(source.path, join(targetDir, source.name));
  await writeFile(
    join(targetDir, 'manifest.json'),
    JSON.stringify({ logo: `/brand/${source.name}` }, null, 2) + '\n',
    'utf8',
  );
}

async function syncAppleIcon(source) {
  const ext = source ? source.name.split('.').pop() : null;
  for (const candidateExt of APPLE_ICON_EXTENSIONS) {
    const path = join(WEB_APPLE_ICON_DIR, `apple-icon.${candidateExt}`);
    if (source && candidateExt === ext) {
      await copyFile(source.path, path);
    } else if (await fileExists(path)) {
      // Remove a stale apple-icon from a previous source extension so Next doesn't serve outdated art.
      await unlink(path).catch(() => {});
    }
  }
}

async function main() {
  try {
    const source = await findSourceFile();
    if (!source) {
      console.warn(
        `[sync-brand] No brand logo found in ${SOURCE_DIR} (looked for ${CANDIDATES.join(', ')}). Skipping — this is not an error.`,
      );
    }
    for (const targetDir of TARGET_DIRS) {
      await syncToTarget(targetDir, source);
    }
    await syncAppleIcon(source);
    await mkdir(dirname(WEB_DATA_MANIFEST), { recursive: true });
    await writeFile(
      WEB_DATA_MANIFEST,
      JSON.stringify({ logo: source ? `/brand/${source.name}` : null }, null, 2) + '\n',
      'utf8',
    );
    if (source) {
      console.log(`[sync-brand] Synced ${source.name} to ${TARGET_DIRS.length} target(s).`);
    }
  } catch (err) {
    // Never fail a build over this — log and exit 0.
    console.warn(
      '[sync-brand] Non-fatal error while syncing brand assets:',
      err instanceof Error ? err.message : err,
    );
  }
}

await main();
