# @entrophy/web

The public Entrophy marketing website — separate from the admin dashboard (`@entrophy/dashboard`). Next.js 15 App
Router, Tailwind 3, a monochrome (black/grey/white) "smoky UI" theme. See `docs/ARCHITECTURE.md` §17 for the full
design and `docs/SPEC.md` §M for requirements.

Depends only on `@entrophy/types` — not `@entrophy/core`, not `@entrophy/ui`. The site has its own small
monochrome component set under `src/components/` and calls the public API directly over `fetch`.

## Pages

| Route | What it is |
|---|---|
| `/` | Hero, "Add to Discord" / "Open dashboard" CTAs, feature overview grid, why-gaming-communities, Enforcer teaser, trust & compliance, donate CTA |
| `/features` | Every plugin: headline, why gaming communities love it, full command table — all anchored on one page |
| `/features/[pluginId]` | Same content, one plugin per page (statically generated from `src/data/commands.json`) |
| `/enforcer` | Admin Enforcer spotlight: workflow diagram, a mock ledger entry, privacy/transparency notes, FAQ |
| `/donate` | Stripe-powered donation page: presets + custom amount → hosted Stripe Checkout |
| `/donate/thanks`, `/donate/cancelled` | Post-checkout landing pages (generic; never call Stripe from the client) |
| `/privacy`, `/terms` | Template legal pages, clearly labelled as templates for the operator to review |
| `not-found` | 404 page |

Command documentation is **generated, never hand-maintained** — see "Data" below.

## Local development

```
pnpm --filter @entrophy/web dev
```

Runs on <http://localhost:3003>. `predev`/`prebuild` run `scripts/sync-brand.mjs` first, which copies the brand
logo from `assets/brand/` into `public/brand/`, `src/data/brand.json`, and `src/app/apple-icon.<ext>` (a no-op —
never fails the build — if the source asset is missing; every consumer degrades to a text wordmark or plain
Open Graph text instead).

For the donate page to show real presets/checkout, run `@entrophy/api` locally (`pnpm --filter @entrophy/api dev`)
with `STRIPE_SECRET_KEY` and `WEB_URL` set — otherwise `/donate` correctly shows the "not configured" state.

## Environment

See the root `.env.example` for the full list. This app reads, all via `NEXT_PUBLIC_*` (inlined at build time into
both server and client bundles):

- `NEXT_PUBLIC_API_URL` — base URL of `@entrophy/api`, used for `GET /donations/presets` and
  `POST /donations/checkout`.
- `NEXT_PUBLIC_DASHBOARD_URL` — "Open dashboard" link target.
- `NEXT_PUBLIC_DISCORD_CLIENT_ID` — builds the "Add to Discord" OAuth URL. When unset, the CTA falls back to
  "Explore features" instead of linking to a broken authorize URL.
- `NEXT_PUBLIC_INVITE_PERMISSIONS` — invite permission bitfield (integer string). Defaults to the value baked
  into `src/data/invite.json` (kept in sync with `INVITE_PERMISSIONS` in `@entrophy/core` by `pnpm commands:export`).
- `NEXT_PUBLIC_SUPPORT_SERVER_URL` — optional; shows a "Support server" footer link when set.

## Data

`src/data/commands.json` and `src/data/invite.json` are generated (never hand-edited) by `pnpm commands:export`
(`packages/plugins/scripts/export-commands.ts`), which also writes `docs/commands.json` and `docs/invite.json`.
CI regenerates them and fails the build if they're stale (`git diff --exit-code`) — so the command tables on
`/features` can never drift from what the bot actually registers.

`src/content/*.ts` (`plugins.ts`, `site.ts`, `enforcer.ts`, `legal.ts`) is the only hand-written copy on the
site — headlines, "why gaming communities love it" bullets, the Enforcer FAQ, and the privacy/terms templates.

## Design system

- **Palette**: CSS variables in `src/app/globals.css` (`--ink-0`…`--ink-7`, `--grey-1`…`--grey-7`, `--paper`).
  Nothing else — no colour accents anywhere. Verify with
  `grep -rniE "#[0-9a-f]{3,8}\b" src --include=*.tsx --include=*.ts` (should only turn up the token
  definitions and monochrome SVG strokes referencing `var(--grey-*)`) and by checking no `text-red-*` /
  `bg-blue-*` / etc. Tailwind default-palette classes are used anywhere in `src/`.
- **Smoky UI**: `Smoke.tsx` (drifting blurred blobs), `Grain.tsx` (SVG noise overlay), `.glass` utility class
  (frosted-glass cards). All pure CSS; the global `prefers-reduced-motion` rule in `globals.css` disables the
  drift animation.
- **Fonts**: system stack only (`ui-sans-serif, -apple-system, "Segoe UI", Inter, Roboto, sans-serif`) — no
  network font loading, so the build works fully offline.
- **Accessibility**: semantic landmarks (`header`/`main`/`footer`/`nav`), a skip-to-content link, visible focus
  rings on every interactive element, and AA contrast within the monochrome palette.

## Testing & build

```
pnpm --filter @entrophy/web typecheck
pnpm --filter @entrophy/web lint
pnpm --filter @entrophy/web build   # standalone output is auto-skipped on win32; see next.config.ts
```
