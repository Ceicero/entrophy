# `media` — Music & Media

Playlist and queue management for a **legal, user-authorized audio source**. This plugin never scrapes,
rips, or bypasses licensing of any streaming platform — see "Why no YouTube/etc." below.

## Status: unavailable by default

`MEDIA_PROVIDER` defaults to `none`. With no compliant provider configured, **every** `/music` subcommand
replies with the same compliance explanation instead of doing anything, and `/plugin status` / this plugin's
`health()` report `unavailable` with the reason. This is intentional, not a bug.

## Commands (`/music`)

| Subcommand                           | Notes                                                                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `play <query>`                       | Searches the configured provider and queues the first result. Public reply.                                                                    |
| `queue`                              | Shows now playing + up to 10 upcoming tracks. Ephemeral.                                                                                       |
| `skip` / `pause` / `resume` / `stop` | Queue-state transitions. DJ-gated. Ephemeral.                                                                                                  |
| `volume <level>`                     | 0-150. DJ-gated.                                                                                                                               |
| `loop <mode>`                        | `off` \| `track` \| `queue`. DJ-gated.                                                                                                         |
| `shuffle`                            | Shuffles the _upcoming_ tracks only (history + current track stay put). DJ-gated, deterministic via an injectable RNG in `queue.ts` for tests. |
| `nowplaying`                         | Read-only, no DJ gate.                                                                                                                         |
| `playlist save <name>`               | Saves the current queue as a named playlist in this guild's config. DJ-gated.                                                                  |
| `playlist load <name>`               | Queues every track from a saved playlist (autocompleted). DJ-gated.                                                                            |
| `playlist list`                      | Read-only.                                                                                                                                     |
| `playlist delete <name>`             | DJ-gated.                                                                                                                                      |

### DJ role gate (`dj-gate.ts`)

- If `config.djRoleId` is set: only members with that role may use mutating subcommands.
- If unset: staff (helper+) **or** a member who is alone in their current voice channel may.

## What "queue management" means here

**Voice playback (`@discordjs/voice`) is intentionally not wired up.** `/music play` and friends manage an
abstract, Redis-backed queue of track _references_ — they do not join a voice channel or produce audio. The
`MediaProvider` interface exposes an optional `createStream(track)` hook specifically so a future, compliant
voice adapter can be added without changing any command code; no shipped provider implements it.

## Why no YouTube scraping / stream ripping (SPEC.md §I)

Downloading or re-streaming audio from a platform without going through its official, bot-permitting API
violates that platform's terms of service and, in many cases, copyright law. This codebase does not — and must
not — add `ytdl-core`, `youtube-dl`, `play-dl`, or similar scraping/ripping dependencies. `providers/none.ts`
is the shipped default; `providers/example-licensed.ts` is a **documented template**, not a working
integration, showing exactly what a real, compliant adapter needs (a licensed API, real credentials, and a
`createStream` implementation) without pretending to be one.

### Plugging in a real, compliant provider

1. Pick a source whose API/terms explicitly permit third-party bot/server playback.
2. Add its required env var(s) to `manifest.ts`'s `requiredEnv`/`optionalEnv`.
3. Implement a new `providers/<name>.ts` satisfying `MediaProvider` (`isConfigured`, `search`, `resolve`, and
   eventually `createStream`).
4. Register it in `providers/resolve.ts`'s provider list, and set `MEDIA_PROVIDER=<name>`.

## Config keys (`PluginConfig` for `media`)

| Key             | Default | Notes                                                            |
| --------------- | ------- | ---------------------------------------------------------------- |
| `djRoleId`      | `null`  | See DJ gate above                                                |
| `defaultVolume` | `100`   | 0-150, used when starting a fresh queue                          |
| `playlists`     | `{}`    | `Record<lowercasedName, { name, tracks, createdBy, createdAt }>` |

## Permissions & intents

None — this plugin never touches roles, channels, or members (no voice connection is made).

## Privacy notes

No audio, message content, or listening history is stored. Only track metadata (title/artist/URL/duration)
for the live queue (Redis, ephemeral) and any playlists staff explicitly save (`PluginConfig`, persistent)
are kept.

## Dashboard

None — `media` has no dashboard page; it's configured entirely through `/music` (DJ role, default volume) —
there is no per-guild settings surface beyond what Discord commands already cover.
