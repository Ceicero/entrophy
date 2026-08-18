# Community plugin (`community`)

Polls, giveaways, a suggestion box, scheduled announcements, reminders, event RSVPs, and opt-in birthday
announcements. Enabled by default.

## Commands

| Command                                                                      | Description                                                               | Who                                       |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------- |
| `/poll create`                                                               | Start a poll (2-10 options, optional duration/anonymous/multi-select)     | Everyone                                  |
| `/poll end <id>`                                                             | End a poll early                                                          | Poll creator or moderator+                |
| `/poll results <id>`                                                         | Show a poll's current results                                             | Everyone                                  |
| `/giveaway start`                                                            | Start a giveaway (prize, duration, winners, optional eligibility rules)   | Moderator+                                |
| `/giveaway end \| reroll \| list \| cancel`                                  | Manage giveaways                                                          | Moderator+                                |
| `/suggest <text>`                                                            | Submit a suggestion                                                       | Everyone                                  |
| `/suggestions setup`                                                         | Choose the suggestions channel                                            | Moderator+                                |
| `/suggestions status <number> <status> [note]`                               | Change a suggestion's status                                              | Moderator+                                |
| `/suggestions list [status]`                                                 | List suggestions                                                          | Moderator+                                |
| `/announce schedule <channel> <when> <message>`                              | Schedule an announcement (cron, ISO date/time, or duration)               | Moderator+                                |
| `/announce list \| cancel \| preview`                                        | Manage scheduled announcements                                            | Moderator+                                |
| `/remind set <when> <message> [channel] [recurring]`                         | Set a reminder (DM by default, or post in a channel)                      | Everyone                                  |
| `/remind list \| cancel`                                                     | Manage your reminders                                                     | Owner, or moderator+ to cancel others'    |
| `/event create`                                                              | Create an event with RSVP, optionally as a native Discord scheduled event | Helper+                                   |
| `/event list \| cancel \| rsvps`                                             | Manage events                                                             | Helper+                                   |
| `/birthday set <month> <day>`                                                | Share your birthday in this server (month + day only — never a year)      | Everyone (when birthdays are enabled)     |
| `/birthday remove`                                                           | Delete your birthday from this server                                     | Everyone                                  |
| `/birthday view [user]`                                                      | See your birthday, or another member's if the public list is on           | Everyone (others: public list or Helper+) |
| `/birthday upcoming [ephemeral]`                                             | Next 15 upcoming birthdays (ephemeral; staff may post it publicly)        | Everyone if public list, else Helper+     |
| `/birthday config <channel> [hour] [role] [message] [enabled] [public_list]` | Configure birthday announcements                                          | Admin+                                    |
| `/birthday config-view`                                                      | Show birthday settings + how many members registered (count only)         | Moderator+                                |

## Config keys (`configSchema`)

```
suggestions.channelId        string|null   Channel suggestions are posted to (null = not set up)
suggestions.threads          boolean       Auto-create a discussion thread per suggestion (default: true)
suggestions.dmAuthorOnStatus boolean       DM the author when their suggestion's status changes (default: true)
giveaways.defaultWinners     number        Default winner count for /giveaway start (default: 1)
eventReminderMinutes         number[]      Minutes-before-start marks to remind RSVP'd members (default: [60, 10])
polls.maxOptions             number        Maximum options per poll, 2-10 (default: 10)
birthdays.enabled            boolean       Birthday announcements + /birthday set on/off (default: false)
birthdays.channelId          string|null   Channel birthdays are announced in (default: null)
birthdays.message            string        Template; tokens {mention} {user} {server} (default: "🎂 Happy birthday, {mention}!")
birthdays.announceHour       number        Guild-local hour 0-23 to announce, using the core timezone (default: 9)
birthdays.roleId             string|null   Optional role added for ~24h on the day (default: null)
birthdays.publicList         boolean       Members may run /birthday upcoming and view each other's (default: true)
```

## Permissions

| Permission                             | Feature                                                  | Optional | Fallback                                        |
| -------------------------------------- | -------------------------------------------------------- | -------- | ----------------------------------------------- |
| Send Messages                          | Posting polls/giveaways/suggestions/announcements/events | No       | Command replies with an error                   |
| Embed Links                            | Result/status embeds                                     | No       | N/A                                             |
| Manage Threads / Create Public Threads | Auto-threading suggestions                               | Yes      | Suggestion still posts, no thread               |
| Manage Events                          | Native Discord scheduled event for `/event create`       | Yes      | Event is still tracked and announced in-channel |
| Manage Roles                           | Birthday role (optional)                                 | Yes      | No role is added; the announcement still posts  |

No privileged intents are required.

## Privacy notes

- Poll votes, giveaway entries, suggestion votes, reminder text, and event RSVPs are stored for as long as the
  record exists, so results can be shown and re-rendered.
- **Anonymous polls never store or display who voted for which option** — only per-option counts are shown or
  returned by `/poll results`.
- Reminder message text is stored until it is delivered or cancelled.
- **Birthdays store only the month and day** a member chooses to share, per server (`Birthday` row per
  guild/user), until the member removes it (`/birthday remove`), an admin removes it from the dashboard, or the
  server's data is deleted (cascade). No year, no age — there is no column for it. The bot never DMs about
  birthdays; announcements only ping the birthday member. Setting/removing your own birthday is **not** audited
  (no audit trail of personal data); config changes and admin removals are audited (admin removal records the
  user id only). Birthdays are included in the guild data export as `{ userId, month, day }`.

## Background jobs

- `community:poll-end` — delayed, one per timed poll (`jobId poll:<id>`); closes the poll and renders final results.
- `community:giveaway-end` — delayed, one per giveaway (`jobId gw:<id>`); draws winners with `crypto.randomInt`, announces, and DMs them.
- `community:announcement-run` — delayed for one-off announcements, or a repeatable scheduler for cron ones (`jobId ann:<id>`).
- `community:reminder-deliver` — delayed for one-off reminders, or a repeatable scheduler for recurring ones (`jobId rem:<id>`).
- `community:reminder-sweep` — every 5 minutes; catches up any one-off reminder whose delayed job was lost.
- `community:event-reminder` — delayed, one per configured reminder mark (`jobId ev:<id>:<minutes>`).
- `community:suggestion-sync` — every minute; reflects dashboard suggestion status/note edits into the posted Discord embed (dashboard writes only touch the database).
- `community:birthday-announce` — hourly (top of the hour); for each guild with birthdays enabled + a channel, when the guild-local hour equals `birthdays.announceHour`, posts one message per birthday due today (Feb 29 → Feb 28 in non-leap years), adds the optional role, and stamps `lastAnnouncedYear` so nothing is announced twice in a year. Members who left are skipped, not deleted.
- `community:birthday-role-remove` — delayed ~24h per birthday role grant (`jobId bday-role:<guild>:<user>:<year>`); removes the role if the member still has it.

## Dashboard

`/dashboard/[guildId]/community` — Overview, Suggestions (status workflow), Giveaways, Polls (results bars),
Announcements, Events (RSVP counts), and Birthdays (settings, count, next 10 upcoming by user id, admin
removal) tabs. The API exposes only a birthday summary (`GET /guilds/:guildId/community/birthdays/summary`),
never a paginated table of every member's date.
