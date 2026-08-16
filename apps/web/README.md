# @entrophy/web

The public Entrophy marketing website — separate from the admin dashboard (`@entrophy/dashboard`). Next.js 15 App
Router, Tailwind 3, a monochrome (black/grey/white) "smoky UI" theme. See `docs/ARCHITECTURE.md` §17 for the full
design and `docs/SPEC.md` §M for requirements.

This workspace is currently a placeholder skeleton (home page only). The full site — Home, Features & Commands,
Enforcer spotlight, Donate (Stripe), Privacy, Terms — lands with the web build stage.

## Local development

```
pnpm --filter @entrophy/web dev
```

Runs on <http://localhost:3003>. `predev`/`prebuild` run `scripts/sync-brand.mjs` first, which copies the brand
logo from `assets/brand/` into `public/brand/` (a no-op if the source asset is missing).

## Environment

See the root `.env.example` for the full list. This app reads (all via `NEXT_PUBLIC_*` at build/runtime, since
it's client code): `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_DASHBOARD_URL`, `NEXT_PUBLIC_DISCORD_CLIENT_ID`,
`NEXT_PUBLIC_INVITE_PERMISSIONS`, `NEXT_PUBLIC_SUPPORT_SERVER_URL` (optional).

## Data

`src/data/commands.json` is generated (never hand-edited) by `pnpm commands:export`
(`packages/plugins/scripts/export-commands.ts`), which also writes `docs/commands.json` and `docs/invite.json`.
CI regenerates it and fails the build if it's stale (`git diff --exit-code`).
