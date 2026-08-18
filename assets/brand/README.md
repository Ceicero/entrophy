# Entrophy brand assets

| File                  | What it is                                                                                                                                                            | Used by                                                                                                                                                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `entrophy-skull.png`  | Canonical Entrophy logo, used everywhere: a pixel-art skull, brighter/cleaner grey pixels on pure black, square (1254×1254). Lossless PNG; takes precedence over the `.jpg` when both exist. | Website, dashboard sidebar, bot avatar (`pnpm --filter @entrophy/bot set-avatar`), embed icons via `WEB_URL/brand/entrophy-skull.<ext>` (served from the web app's `public/brand/`), Discord Developer Portal app icon (manual upload). |
| `entrophy-skull.jpg`  | The same art re-encoded as JPEG. Kept only for backwards-compatible URLs/cached references that still name the `.jpg` file — not used as the preferred source anywhere. | Served alongside the `.png` from every app's `public/brand/` so old `.jpg` links keep working; never referenced as the preferred `logo` in a manifest.                                                                                        |

`pnpm brand:sync` (run automatically before `dev`/`build` of the web and dashboard apps) copies every shared logo
file that exists (`entrophy-skull.png` and `entrophy-skull.jpg`) into each app's `public/brand/` folder unchanged,
and writes each app's `public/brand/manifest.json` with `logo` naming the preferred one
(`{ "logo": "/brand/entrophy-skull.png" }`). It also writes a git-tracked, build-time copy of that manifest —
`apps/web/src/data/brand.json` and `apps/dashboard/src/data/brand.json` — that each app's logo component imports
directly instead of fetching `public/brand/manifest.json` at runtime. Everything degrades gracefully while a file is
missing (text wordmark, SVG fallback favicon, no embed icon).

An optional website-only override still exists in the script: dropping `entrophy-skull-web.png`/`.jpg` into this
folder would make the public website display that variant instead (header/hero/apple-icon only), while the
dashboard, bot avatar, and embed icons keep reading the shared `entrophy-skull.<ext>` above. No such file is
currently present in the repo — the shared logo already is the clean/bright art the website wants.

Do not commit other raster variants — sizes are generated at build/serve time.
