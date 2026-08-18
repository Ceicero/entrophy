# Community plugin (`community`)

Polls, giveaways, a suggestion box, scheduled announcements, reminders, event RSVPs, and sticky messages. Enabled by default.

## Commands

| Command                                              | Description                                                                                                | Who                                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `/poll create`                                       | Start a poll (2-10 options, optional duration/anonymous/multi-select)                                      | Everyone                               |
| `/poll end <id>`                                     | End a poll early                                                                                           | Poll creator or moderator+             |
| `/poll results <id>`                                 | Show a poll's current results                                                                              | Everyone                               |
| `/giveaway start`                                    | Start a giveaway (prize, duration, winners, optional eligibility rules)                                    | Moderator+                             |
| `/giveaway end \| reroll \| list \| cancel`          | Manage giveaways                                                                                           | Moderator+                             |
| `/suggest <text>`                                    | Submit a suggestion                                                                                        | Everyone                               |
| `/suggestions setup`                                 | Choose the suggestions channel                                                                             | Moderator+                             |
| `/suggestions status <number> <status> [note]`       | Change a suggestion's status                                                                               | Moderator+                             |
| `/suggestions list [status]`                         | List suggestions                                                                                           | Moderator+                             |
| `/announce schedule <channel> <when> <message>`      | Schedule an announcement (cron, ISO date/time, or duration)                                                | Moderator+                             |
| `/announce list \| cancel \| preview`                | Manage scheduled announcements                                                                             | Moderator+                             |
| `/remind set <when> <message> [channel] [recurring]` | Set a reminder (DM by default, or post in a channel)                                                       | Everyone                               |
| `/remind list \| cancel`                             | Manage your reminders                                                                                      | Owner, or moderator+ to cancel others' |
| `/event create`                                      | Create an event with RSVP, optionally as a native Discord scheduled event                                  | Helper+                                |
| `/event list \| cancel \| rsvps`                     | Manage events                                                                                              | Helper+                                |
| `/sticky set [channel] [content] [cooldown]`         | Keep a staff message at the bottom of a channel (no `content` → editor modal with embed title/description) | Moderator+                             |
| `/sticky remove [channel]`                           | Remove a channel's sticky (deletes the record and the bot's last post)                                     | Moderator+                             |
| `/sticky list`                                       | List every sticky in the server with jump links                                                            | Moderator+                             |

## Config keys (`configSchema`)

```
suggestions.channelId        string|null   Channel suggestions are posted to (null = not set up)
suggestions.threads          boolean       Auto-create a discussion thread per suggestion (default: true)
suggestions.dmAuthorOnStatus boolean       DM the author when their suggestion's status changes (default: true)
giveaways.defaultWinners     number        Default winner count for /giveaway start (default: 1)
eventReminderMinutes         number[]      Minutes-before-start marks to remind RSVP'd members (default: [60, 10])
polls.maxOptions             number        Maximum options per poll, 2-10 (default: 10)
sticky.enabled               boolean       Re-post sticky messages when members post (default: true)
sticky.maxPerGuild           number        Maximum stickies per server, 1-100 (default: 25)
sticky.defaultCooldownSeconds number       Default minimum seconds between re-posts, 3-600 (default: 10)
```

## Permissions

| Permission                             | Feature                                                  | Optional | Fallback                                                                                                                                                                                    |
| -------------------------------------- | -------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Send Messages                          | Posting polls/giveaways/suggestions/announcements/events | No       | Command replies with an error                                                                                                                                                               |
| Embed Links                            | Result/status embeds                                     | No       | N/A                                                                                                                                                                                         |
| Manage Threads / Create Public Threads | Auto-threading suggestions                               | Yes      | Suggestion still posts, no thread                                                                                                                                                           |
| Manage Events                          | Native Discord scheduled event for `/event create`       | Yes      | Event is still tracked and announced in-channel                                                                                                                                             |
| Manage Messages                        | Sticky messages (delete the bot's own previous sticky)   | Yes      | Old sticky stays in place; a new one is still posted (deleting the bot's own message doesn't strictly need it, but a channel overwrite can still remove it — `/permissions audit` explains) |

No privileged intents are required.

## Privacy notes

- Poll votes, giveaway entries, suggestion votes, reminder text, and event RSVPs are stored for as long as the
  record exists, so results can be shown and re-rendered.
- **Anonymous polls never store or display who voted for which option** — only per-option counts are shown or
  returned by `/poll results`.
- Reminder message text is stored until it is delivered or cancelled.
- **Sticky messages store only the text/embed staff wrote and the id of the bot's own last post.** The
  `messageCreate` handler never reads member message content — it only reacts to "a message was posted" in a
  channel that has a sticky (a Redis-cached channel set makes that check cheap for every other channel).

## Background jobs

- `community:poll-end` — delayed, one per timed poll (`jobId poll:<id>`); closes the poll and renders final results.
- `community:giveaway-end` — delayed, one per giveaway (`jobId gw:<id>`); draws winners with `crypto.randomInt`, announces, and DMs them.
- `community:announcement-run` — delayed for one-off announcements, or a repeatable scheduler for cron ones (`jobId ann:<id>`).
- `community:reminder-deliver` — delayed for one-off reminders, or a repeatable scheduler for recurring ones (`jobId rem:<id>`).
- `community:reminder-sweep` — every 5 minutes; catches up any one-off reminder whose delayed job was lost.
- `community:event-reminder` — delayed, one per configured reminder mark (`jobId ev:<id>:<minutes>`).
- `community:suggestion-sync` — every minute; reflects dashboard suggestion status/note edits into the posted Discord embed (dashboard writes only touch the database).
- `community:sticky-repost` — delayed catch-up re-post for a channel whose cooldown blocked an immediate one (`jobId sticky:<guildId>:<channelId>`, delay = the sticky's cooldown; enqueuing while one is pending is a no-op, so a burst of messages yields one re-post now and one after the cooldown).

## Sticky messages

`/sticky set` posts the sticky immediately. Whenever a member posts in that channel, the bot deletes its previous
copy and re-posts at the bottom — but never more than once per `cooldown` seconds (per channel, Redis
`SET NX EX`); a blocked re-post schedules the single `sticky-repost` catch-up job instead. Mentions are always
suppressed in the re-posted payload. If the channel is deleted, the sticky record is dropped automatically.

## Dashboard

`/dashboard/[guildId]/community` — Overview, Suggestions (status workflow), Giveaways, Polls (results bars),
Announcements, Events (RSVP counts), and Channels (sticky messages: channel, preview, cooldown, last re-post,
Remove) tabs. Removing a sticky from the dashboard deletes the record and stops re-posts; the bot's last posted
copy stays in Discord (the API has no gateway) — delete it there or run `/sticky remove`.
