# Entrophy brand assets

| File                     | What it is                                                                                                                                                                                                                                    | Used by                                                                                                                                                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entrophy-skull.jpg`     | The shared Entrophy logo and bot avatar: a pixel-art skull, dark smoky grey pixels on pure black, square (1245×1245). Original supplied by Brandon (JPEG). A lossless `entrophy-skull.png` may be added later and takes precedence when present. | Dashboard sidebar, bot avatar (`pnpm --filter @entrophy/bot set-avatar`), embed icons via `WEB_URL/brand/entrophy-skull.<ext>` (served from the web app's `public/brand/`), Discord Developer Portal app icon (manual upload). |
| `entrophy-skull-web.png` | Brighter, cleaner variant used by the public website's header/logo/apple-icon only. Square (1254×1254). Dashboard, bot avatar, and embed icons keep `entrophy-skull.jpg` — do not repoint them at this file.                                    | Website header/hero/Open Graph credit/apple-icon (via `apps/web/public/brand/manifest.json` → `logo`, and `apps/web/src/data/brand.json` → `logo`).                                                                            |

`pnpm brand:sync` (run automatically before `dev`/`build` of the web and dashboard apps) copies the shared logo into
each app's `public/brand/` folder (as `entrophy-skull.png` if present, else `entrophy-skull.jpg`) unchanged as
before, and additionally copies the web-only variant (`entrophy-skull-web.png`/`.jpg`, falling back to the shared
logo when no web-only file exists) into `apps/web/public/brand/`. It writes `apps/dashboard/public/brand/manifest.json`
(`{ "logo": "/brand/entrophy-skull.jpg" }`, unchanged) and `apps/web/public/brand/manifest.json` /
`apps/web/src/data/brand.json` (`{ "logo": "/brand/entrophy-skull-web.png", "sharedLogo": "/brand/entrophy-skull.jpg" }`
— `logo` is what the website displays, `sharedLogo` always points at the shared file). Everything degrades
gracefully while a file is missing (text wordmark, SVG fallback favicon, no embed icon).

Do not commit other raster variants — sizes are generated at build/serve time.
