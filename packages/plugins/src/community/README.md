# Community plugin (`community`)

Polls, giveaways, a suggestion box, scheduled announcements, reminders, event RSVPs, and channel automations
(auto-publish for announcement channels, one-thread-per-post auto-threads). Enabled by default.

## Commands

| Command                                              | Description                                                                     | Who                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------- |
| `/poll create`                                       | Start a poll (2-10 options, optional duration/anonymous/multi-select)           | Everyone                               |
| `/poll end <id>`                                     | End a poll early                                                                | Poll creator or moderator+             |
| `/poll results <id>`                                 | Show a poll's current results                                                   | Everyone                               |
| `/giveaway start`                                    | Start a giveaway (prize, duration, winners, optional eligibility rules)         | Moderator+                             |
| `/giveaway end \| reroll \| list \| cancel`          | Manage giveaways                                                                | Moderator+                             |
| `/suggest <text>`                                    | Submit a suggestion                                                             | Everyone                               |
| `/suggestions setup`                                 | Choose the suggestions channel                                                  | Moderator+                             |
| `/suggestions status <number> <status> [note]`       | Change a suggestion's status                                                    | Moderator+                             |
| `/suggestions list [status]`                         | List suggestions                                                                | Moderator+                             |
| `/announce schedule <channel> <when> <message>`      | Schedule an announcement (cron, ISO date/time, or duration)                     | Moderator+                             |
| `/announce list \| cancel \| preview`                | Manage scheduled announcements                                                  | Moderator+                             |
| `/remind set <when> <message> [channel] [recurring]` | Set a reminder (DM by default, or post in a channel)                            | Everyone                               |
| `/remind list \| cancel`                             | Manage your reminders                                                           | Owner, or moderator+ to cancel others' |
| `/event create`                                      | Create an event with RSVP, optionally as a native Discord scheduled event       | Helper+                                |
| `/event list \| cancel \| rsvps`                     | Manage events                                                                   | Helper+                                |
| `/channelauto publish add \| remove \| list`         | Auto-publish every new message in an announcement channel                       | Admin+                                 |
| `/channelauto thread add \| remove \| list`          | One thread per post in a channel (template, archive, attachments-only, starter) | Admin+                                 |

## Config keys (`configSchema`)

```
suggestions.channelId        string|null   Channel suggestions are posted to (null = not set up)
suggestions.threads          boolean       Auto-create a discussion thread per suggestion (default: true)
suggestions.dmAuthorOnStatus boolean       DM the author when their suggestion's status changes (default: true)
giveaways.defaultWinners     number        Default winner count for /giveaway start (default: 1)
eventReminderMinutes         number[]      Minutes-before-start marks to remind RSVP'd members (default: [60, 10])
polls.maxOptions             number        Maximum options per poll, 2-10 (default: 10)
autoPublish.channelIds       string[]      Announcement channels whose new messages are crossposted automatically (max 25)
autoPublish.includeBots      boolean       Also publish other bots'/webhooks' messages (default: false — humans + this bot only)
autoThreads[]                object[]      One rule per channel (max 25):
  .channelId                 string          Text or announcement channel
  .nameTemplate              string          Thread name; tokens {user} {user.tag} {server} {date} (default: "{user} — {date}", trimmed to 100)
  .archiveMinutes            60|1440|4320|10080  Auto-archive after inactivity (default: 1440)
  .requireAttachment         boolean         Only thread posts with an attachment/embed (default: false)
  .starterMessage            string|null     Optional bot message posted in each new thread, max 300 chars (default: null)
```

### Channel automations

- **Auto-publish** — every new message in a listed announcement channel is published (crossposted) to follower
  servers via `messageCreate` → `message.crosspost()`. Messages already published, and other bots'/webhooks'
  messages (unless `includeBots`), are skipped. Publishing other members' messages needs **Manage Messages** in
  that channel; without it only the bot's own posts are published. Discord caps publishing at 10 messages per
  hour per channel. Failures (missing permission, crosspost limit) are logged **once per hour per channel**
  (Redis `SET NX EX 3600`) to the bot log and, if the `logging` plugin is on, as a `bot.error` entry. Successful
  publishes bump a per-day Redis counter (`entrophy:community:autopublish-count:<guildId>:<YYYY-MM-DD>`, UTC)
  that the dashboard shows as "published today" (`GET /guilds/:guildId/community/channel-automations/stats`).
- **Auto-threads** — every human post in a listed text/announcement channel gets its own thread named from the
  template (`{user}` = display name, `{user.tag}`, `{server}`, `{date}` = YYYY-MM-DD; unknown tokens are left
  literal; trimmed to 100 chars). Bot posts, posts that already have a thread, and — with `requireAttachment` —
  text-only posts are skipped. Errors are logged once per hour per channel and never thrown.
- Neither feature reads or stores message content — only channel id, author id/bot flag, message flags, and
  whether attachments/embeds are present.

## Permissions

| Permission                             | Feature                                                  | Optional | Fallback                                                    |
| -------------------------------------- | -------------------------------------------------------- | -------- | ----------------------------------------------------------- |
| Send Messages                          | Posting polls/giveaways/suggestions/announcements/events | No       | Command replies with an error                               |
| Embed Links                            | Result/status embeds                                     | No       | N/A                                                         |
| Manage Threads / Create Public Threads | Auto-threading suggestions, auto-threads                 | Yes      | Suggestion/message still posts, no thread                   |
| Manage Messages                        | Auto-publish other members' announcement messages        | Yes      | Only the bot's own messages are published; warned once/hour |
| Manage Events                          | Native Discord scheduled event for `/event create`       | Yes      | Event is still tracked and announced in-channel             |

No privileged intents are required.

## Privacy notes

- Poll votes, giveaway entries, suggestion votes, reminder text, and event RSVPs are stored for as long as the
  record exists, so results can be shown and re-rendered.
- **Anonymous polls never store or display who voted for which option** — only per-option counts are shown or
  returned by `/poll results`.
- Reminder message text is stored until it is delivered or cancelled.
- Auto-publish and auto-threads act only on message ids/authors in the channels you list; content is never read
  or stored.

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
Announcements, Events (RSVP counts), and Channels (auto-publish channel list + "published today", auto-thread
rules with an inline editor) tabs. The Channels tab and the generic plugin config drawer edit the same
`autoPublish` / `autoThreads` keys.
