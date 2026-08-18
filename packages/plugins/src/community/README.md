# Community plugin (`community`)

Polls, giveaways, a suggestion box, scheduled announcements, reminders, event RSVPs, and server-stats counter channels. Enabled by default.

## Commands

| Command                                              | Description                                                               | Who                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------- |
| `/poll create`                                       | Start a poll (2-10 options, optional duration/anonymous/multi-select)     | Everyone                               |
| `/poll end <id>`                                     | End a poll early                                                          | Poll creator or moderator+             |
| `/poll results <id>`                                 | Show a poll's current results                                             | Everyone                               |
| `/giveaway start`                                    | Start a giveaway (prize, duration, winners, optional eligibility rules)   | Moderator+                             |
| `/giveaway end \| reroll \| list \| cancel`          | Manage giveaways                                                          | Moderator+                             |
| `/suggest <text>`                                    | Submit a suggestion                                                       | Everyone                               |
| `/suggestions setup`                                 | Choose the suggestions channel                                            | Moderator+                             |
| `/suggestions status <number> <status> [note]`       | Change a suggestion's status                                              | Moderator+                             |
| `/suggestions list [status]`                         | List suggestions                                                          | Moderator+                             |
| `/announce schedule <channel> <when> <message>`      | Schedule an announcement (cron, ISO date/time, or duration)               | Moderator+                             |
| `/announce list \| cancel \| preview`                | Manage scheduled announcements                                            | Moderator+                             |
| `/remind set <when> <message> [channel] [recurring]` | Set a reminder (DM by default, or post in a channel)                      | Everyone                               |
| `/remind list \| cancel`                             | Manage your reminders                                                     | Owner, or moderator+ to cancel others' |
| `/event create`                                      | Create an event with RSVP, optionally as a native Discord scheduled event | Helper+                                |
| `/event list \| cancel \| rsvps`                     | Manage events                                                             | Helper+                                |
| `/statschannel create <template> [category] [kind]`  | Create a locked voice channel (or category) showing a live server count   | Admin (bot needs Manage Channels)      |
| `/statschannel add <channel> <template>`             | Attach an existing voice/category/text channel as a counter               | Admin                                  |
| `/statschannel remove <channel>`                     | Stop updating a counter (config only — the channel is not deleted)        | Admin                                  |
| `/statschannel list`                                 | Show counters, templates, current rendered value, last refresh            | Admin                                  |
| `/statschannel refresh`                              | Refresh every counter now (at most once per 5 minutes)                    | Admin                                  |
| `/statschannel interval <minutes>`                   | Set the automatic refresh interval (10-1440 minutes)                      | Admin                                  |

## Config keys (`configSchema`)

```
suggestions.channelId        string|null   Channel suggestions are posted to (null = not set up)
suggestions.threads          boolean       Auto-create a discussion thread per suggestion (default: true)
suggestions.dmAuthorOnStatus boolean       DM the author when their suggestion's status changes (default: true)
giveaways.defaultWinners     number        Default winner count for /giveaway start (default: 1)
eventReminderMinutes         number[]      Minutes-before-start marks to remind RSVP'd members (default: [60, 10])
polls.maxOptions             number        Maximum options per poll, 2-10 (default: 10)
statsChannels                array         Up to 10 `{ channelId, template }` counters (default: [])
statsRefreshMinutes          number        Minutes between automatic counter refreshes, 10-1440 (default: 15)
```

### Server-stats counter channels

Templates use a fixed token set — `{members}` (all), `{humans}`, `{bots}`, `{boosts}`, `{roles}`, `{channels}`,
`{date}` (YYYY-MM-DD in the guild timezone). Unknown tokens are rejected at command/dashboard time so a typo never
becomes a channel literally named "{memebrs}"; the rendered name is truncated to Discord's 100-character limit.

Constraints (also stated in the UI):

- **Discord allows 2 channel-name edits per 10 minutes per channel.** Counters therefore refresh on a schedule
  (`statsRefreshMinutes`, minimum 10) and `/statschannel refresh` is limited to once per 5 minutes; member
  join/leave events deliberately do _not_ trigger a rename.
- **`{online}` is not offered** — it needs the Presence privileged intent, which Entrophy does not enable. The
  command rejects it with that explanation.
- `{humans}`/`{bots}` need the Server Members intent; without it `{humans}` = `{members}` and `{bots}` = 0 (the
  reply says so).

`/statschannel create` makes a voice channel with `@everyone` denied Connect (visible, not joinable). If a counter
channel is deleted in Discord, the next refresh drops it from config (info log, no crash).

## Permissions

| Permission                             | Feature                                                  | Optional | Fallback                                                                       |
| -------------------------------------- | -------------------------------------------------------- | -------- | ------------------------------------------------------------------------------ |
| Send Messages                          | Posting polls/giveaways/suggestions/announcements/events | No       | Command replies with an error                                                  |
| Embed Links                            | Result/status embeds                                     | No       | N/A                                                                            |
| Manage Threads / Create Public Threads | Auto-threading suggestions                               | Yes      | Suggestion still posts, no thread                                              |
| Manage Events                          | Native Discord scheduled event for `/event create`       | Yes      | Event is still tracked and announced in-channel                                |
| Manage Channels                        | Server-stats counter channels (rename)                   | Yes      | Counters stop updating; `/statschannel refresh` reports the missing permission |

No privileged intents are required.

## Privacy notes

- Poll votes, giveaway entries, suggestion votes, reminder text, and event RSVPs are stored for as long as the
  record exists, so results can be shown and re-rendered.
- **Anonymous polls never store or display who voted for which option** — only per-option counts are shown or
  returned by `/poll results`.
- Reminder message text is stored until it is delivered or cancelled.
- Stats channels display only aggregate server counts (members, humans, bots, boosts, roles, channels); nothing
  per member is read or stored.

## Background jobs

- `community:poll-end` — delayed, one per timed poll (`jobId poll:<id>`); closes the poll and renders final results.
- `community:giveaway-end` — delayed, one per giveaway (`jobId gw:<id>`); draws winners with `crypto.randomInt`, announces, and DMs them.
- `community:announcement-run` — delayed for one-off announcements, or a repeatable scheduler for cron ones (`jobId ann:<id>`).
- `community:reminder-deliver` — delayed for one-off reminders, or a repeatable scheduler for recurring ones (`jobId rem:<id>`).
- `community:reminder-sweep` — every 5 minutes; catches up any one-off reminder whose delayed job was lost.
- `community:event-reminder` — delayed, one per configured reminder mark (`jobId ev:<id>:<minutes>`).
- `community:suggestion-sync` — every minute; reflects dashboard suggestion status/note edits into the posted Discord embed (dashboard writes only touch the database).
- `community:stats-refresh` — every 5 minutes; renames each guild's stats channels at most once per `statsRefreshMinutes` (Redis `SET NX EX` gate per guild), concurrency 1, never throws.

## Dashboard

`/dashboard/[guildId]/community` — Overview, Suggestions (status workflow), Giveaways, Polls (results bars),
Announcements, Events (RSVP counts), and Channels (server-stats counters: attach/edit/remove + refresh interval;
new counters are created with `/statschannel create`) tabs.
