#!/usr/bin/env node
// Syncs the brand logo from assets/brand/ into each app's public/brand/ (ARCHITECTURE.md §22). Run automatically
// as predev/prebuild for apps/web and apps/dashboard, and manually via `pnpm brand:sync`. Never throws — a
// missing source asset is a no-op (features that reference the logo degrade gracefully, per §22) so this script
// can never fail a build.
import { copyFile, mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = join(REPO_ROOT, 'assets', 'brand');
// PNG (lossless) takes precedence over JPG if both exist, per ARCHITECTURE.md §22.
const CANDIDATES = ['entrophy-skull.png', 'entrophy-skull.jpg'];
const TARGET_DIRS = [join(REPO_ROOT, 'apps', 'web', 'public', 'brand'), join(REPO_ROOT, 'apps', 'dashboard', 'public', 'brand')];

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
  await writeFile(join(targetDir, 'manifest.json'), JSON.stringify({ logo: `/brand/${source.name}` }, null, 2) + '\n', 'utf8');
}

async function main() {
  try {
    const source = await findSourceFile();
    if (!source) {
      console.warn(`[sync-brand] No brand logo found in ${SOURCE_DIR} (looked for ${CANDIDATES.join(', ')}). Skipping — this is not an error.`);
    }
    for (const targetDir of TARGET_DIRS) {
      await syncToTarget(targetDir, source);
    }
    if (source) {
      console.log(`[sync-brand] Synced ${source.name} to ${TARGET_DIRS.length} target(s).`);
    }
  } catch (err) {
    // Never fail a build over this — log and exit 0.
    console.warn('[sync-brand] Non-fatal error while syncing brand assets:', err instanceof Error ? err.message : err);
  }
}

await main();
