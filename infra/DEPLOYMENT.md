# Deployment guide

Concise, real guidance for running Entrophy outside local dev. See the root `README.md` for
first-time setup and `.env.example` for every variable.

## Required environment

Set every variable in `.env.example` that your enabled plugins/integrations need. At minimum for a
production boot: `NODE_ENV=production`, `DATABASE_URL`, `REDIS_URL`, `DISCORD_TOKEN`,
`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_OAUTH_REDIRECT_URI`, `ENCRYPTION_KEY`,
`SESSION_SECRET`, `API_BASE_URL`, `DASHBOARD_URL`, `NEXT_PUBLIC_API_URL`. Generate secrets with
`openssl rand -base64 32`. Never commit `.env`; inject it via your platform's secret store
(environment variables, Docker secrets, or a managed secrets manager) instead of baking it into an
image.

`E2E_TEST_MODE` must be unset or `false` in production — the api hard-refuses `/auth/test-login`
whenever `NODE_ENV=production` regardless of this flag, but don't rely on that as your only guard.

## Migrations before start

Always run `pnpm db:migrate` (Prisma `migrate deploy`) against the target database **before**
starting `bot` or `api`, and never run `migrate dev` against a production database. In
`docker-compose.yml` this is the `migrate` one-shot service that `bot`, `api`, and `dashboard`
depend on via `service_completed_successfully`. In a non-Compose deployment, run it as a release
step / init container ahead of rolling out the new `bot`/`api` images.

## One bot process (no sharding in MVP)

Run exactly one instance of `apps/bot`. Discord's gateway does not require sharding until a bot is
in roughly 2,500+ guilds (`GatewayIntentBits`-based bots get a `Sharded: true` requirement signal
from the gateway itself at that point). If you approach that threshold, introduce
`discord.js`'s `ShardingManager` and move per-shard state (in-memory caches, not application data)
accordingly — the database/Redis layers here are already shard-safe since all state lives outside
the bot process. Do not add sharding speculatively; it adds operational complexity the MVP does not
need.

## API behind a reverse proxy with TLS

Run `apps/api` behind a reverse proxy (nginx, Caddy, a cloud load balancer, etc.) that terminates
TLS and forwards to the Fastify process over plain HTTP on the internal network. Set `TRUST_PROXY=true`
so Fastify trusts `X-Forwarded-*` headers for correct client IPs (rate limiting) and protocol
detection (secure cookies). Terminate TLS for the dashboard the same way, or serve it via a platform
that does this for you (Vercel, etc.).

## Cookie domain & CORS

- `COOKIE_DOMAIN` should be the shared parent domain of the api and dashboard (e.g. `.example.com`
  when api is `api.example.com` and dashboard is `app.example.com`). Leave unset only if api and
  dashboard share the exact same origin.
- `DASHBOARD_URL` must exactly match the dashboard's origin — it is the CORS allowlist entry and
  the OAuth post-login redirect target. Mismatches break both.
- `DISCORD_OAUTH_REDIRECT_URI` must be registered byte-for-byte in the Discord Developer Portal.

## Scaling workers

`apps/bot` hosts BullMQ workers in-process alongside the gateway connection. If job volume grows
past what a single process can process promptly, split workers into a dedicated process (reuse
`src/workers.ts`, pointed at the same Redis, without calling `client.login`) and scale that process
independently of the single gateway process. `apps/api` is stateless (session state lives in Redis)
and can be scaled horizontally behind the reverse proxy without any special configuration.

## Backups

- **Postgres**: schedule regular `pg_dump` (or your provider's managed snapshot/PITR) backups of
  the `entrophy` database. Test restores periodically — an untested backup is not a backup.
- **Redis**: treat Redis as ephemeral cache/queue/session state, not a system of record. Losing it
  logs everyone out and drops in-flight jobs, but no durable data is lost. Enable AOF or RDB
  snapshots if you want faster recovery, but do not depend on Redis backups for correctness.

## Log shipping

Both `bot` and `api` log structured JSON via pino in production (pino-pretty is dev-only). Ship
stdout/stderr to your log aggregator of choice (e.g. a Docker logging driver, Vector, Fluent Bit, or
your cloud provider's log collector). Logs never contain message content, tokens, or secrets by
design (see `@entrophy/core` `logger.ts` redact paths) — do not add fields that defeat that.

## Updating

1. `git pull` (or pull the new image tag).
2. Run `pnpm install --frozen-lockfile` (or rebuild images) so dependencies match the lockfile.
3. Run `pnpm db:migrate` against the target database.
4. Restart `bot`, `api`, `dashboard` (rolling restart is safe for `api`/`dashboard` since they are
   stateless; `bot` has a brief gateway reconnect on restart).

## Rollback

1. Re-deploy the previous known-good image tag / git commit for `bot`, `api`, `dashboard`.
2. Only roll back a migration if the new migration is confirmed to be the cause **and** you have a
   verified backup — Prisma migrations are forward-only by default; write a compensating migration
   rather than attempting to reverse-apply SQL by hand unless you are certain it's safe.
3. Re-run `pnpm db:migrate` only if you've added a compensating migration; otherwise the schema
   stays as-is and only the application code rolls back.
