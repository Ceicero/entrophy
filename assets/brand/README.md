# Entrophy brand assets

| File | What it is | Used by |
|---|---|---|
| `entrophy-skull.jpg` | The Entrophy logo and bot avatar: a pixel-art skull, dark smoky grey pixels on pure black, square (1245×1245). Original supplied by Brandon (JPEG). A lossless `entrophy-skull.png` may be added later and takes precedence when present. | Website header/hero/OG image/favicon, dashboard sidebar, bot avatar (`pnpm --filter @entrophy/bot set-avatar`), embed icons via `WEB_URL/brand/entrophy-skull.<ext>`, Discord Developer Portal app icon (manual upload). |

`pnpm brand:sync` (run automatically before `dev`/`build` of the web and dashboard apps) copies the logo into each
app's `public/brand/` folder (as `entrophy-skull.png` if present, else `entrophy-skull.jpg`) and writes
`apps/*/public/brand/manifest.json` (`{ "logo": "/brand/entrophy-skull.jpg" }`) so pages know which file exists.
Everything degrades gracefully while the file is missing (text wordmark, SVG fallback favicon, no embed icon).

Do not commit other raster variants — sizes are generated at build/serve time.
