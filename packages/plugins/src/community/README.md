# Community plugin (`community`)

Polls, giveaways, a suggestion box, scheduled announcements, reminders, and event RSVPs. Enabled by default.

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

## Config keys (`configSchema`)

```
suggestions.channelId        string|null   Channel suggestions are posted to (null = not set up)
suggestions.threads          boolean       Auto-create a discussion thread per suggestion (default: true)
suggestions.dmAuthorOnStatus boolean       DM the author when their suggestion's status changes (default: true)
giveaways.defaultWinners     number        Default winner count for /giveaway start (default: 1)
eventReminderMinutes         number[]      Minutes-before-start marks to remind RSVP'd members (default: [60, 10])
polls.maxOptions             number        Maximum options per poll, 2-10 (default: 10)
```

## Permissions

| Permission                             | Feature                                                  | Optional | Fallback                                        |
| -------------------------------------- | -------------------------------------------------------- | -------- | ----------------------------------------------- |
| Send Messages                          | Posting polls/giveaways/suggestions/announcements/events | No       | Command replies with an error                   |
| Embed Links                            | Result/status embeds                                     | No       | N/A                                             |
| Manage Threads / Create Public Threads | Auto-threading suggestions                               | Yes      | Suggestion still posts, no thread               |
| Manage Events                          | Native Discord scheduled event for `/event create`       | Yes      | Event is still tracked and announced in-channel |

No privileged intents are required.

## Privacy notes

- Poll votes, giveaway entries, suggestion votes, reminder text, and event RSVPs are stored for as long as the
  record exists, so results can be shown and re-rendered.
- **Anonymous polls never store or display who voted for which option** — only per-option counts are shown or
  returned by `/poll results`.
- Reminder message text is stored until it is delivered or cancelled.

## Background jobs

- `community:poll-end` — delayed, one per timed poll (`jobId poll:<id>`); closes the poll and renders final results.
- `community:giveaway-end` — delayed, one per giveaway (`jobId gw:<id>`); draws winners with `crypto.randomInt`, announces, and DMs them.
- `community:announcement-run` — delayed for one-off announcements, or a repeatable scheduler for cron ones (`jobId ann:<id>`).
- `community:reminder-deliver` — delayed for one-off reminders, or a repeatable scheduler for recurring ones (`jobId rem:<id>`).
- `community:reminder-sweep` — every 5 minutes; catches up any one-off reminder whose delayed job was lost.
- `community:event-reminder` — delayed, one per configured reminder mark (`jobId ev:<id>:<minutes>`).
- `community:suggestion-sync` — every minute; reflects dashboard suggestion status/note edits into the posted Discord embed (dashboard writes only touch the database).

## Dashboard

`/dashboard/[guildId]/community` — Overview, Suggestions (status workflow), Giveaways, Polls (results bars),
Announcements, and Events (RSVP counts) tabs.
