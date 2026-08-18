// DTOs for the community + economy plugins' dashboard-facing endpoints (ARCHITECTURE.md §10, community build
// stage). Deliberately a standalone module (not re-exported from `./index.ts` — the wiring stage adds that
// barrel export) so `@entrophy/types/community` can be imported directly per the community build task's
// ownership rules.

export interface PollOptionDto {
  id: string;
  label: string;
  position: number;
  emoji: string | null;
  votes: number;
  /** Present only when the poll is not anonymous. */
  voterIds?: string[];
}

export interface PollDto {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string | null;
  question: string;
  anonymous: boolean;
  multiSelect: boolean;
  endsAt: string | null;
  closed: boolean;
  createdBy: string;
  totalVotes: number;
  options: PollOptionDto[];
  createdAt: string;
  updatedAt: string;
}

export interface PollResultsDto {
  pollId: string;
  question: string;
  anonymous: boolean;
  closed: boolean;
  totalVotes: number;
  options: PollOptionDto[];
}

export interface GiveawayDto {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string | null;
  prize: string;
  winnerCount: number;
  hostId: string;
  endsAt: string;
  ended: boolean;
  requiredRoleIds: string[];
  minAccountAgeDays: number | null;
  minLevel: number | null;
  winnerIds: string[];
  entryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SuggestionDto {
  id: string;
  guildId: string;
  number: number;
  authorId: string;
  channelId: string;
  messageId: string | null;
  content: string;
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'IMPLEMENTED' | 'CONSIDERING';
  staffNote: string | null;
  threadId: string | null;
  upvotes: number;
  downvotes: number;
  createdAt: string;
  updatedAt: string;
}

export interface AnnouncementContentDto {
  content: string;
}

export interface AnnouncementDto {
  id: string;
  guildId: string;
  channelId: string;
  content: AnnouncementContentDto;
  cron: string | null;
  runAt: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityEventRsvpCountsDto {
  going: number;
  maybe: number;
  declined: number;
}

export interface CommunityEventDto {
  id: string;
  guildId: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  channelId: string | null;
  messageId: string | null;
  hostId: string;
  discordEventId: string | null;
  reminderMinutes: number[];
  rsvps: CommunityEventRsvpCountsDto;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Birthdays (spec CG-06) — month + day only; there is no year field anywhere, by design.
// ---------------------------------------------------------------------------

export interface BirthdayConfigDto {
  enabled: boolean;
  channelId: string | null;
  /** Announcement template; tokens `{mention}`, `{user}`, `{server}`. */
  message: string;
  /** Guild-local hour (0–23), interpreted in the guild's `GuildConfig.timezone`. */
  announceHour: number;
  roleId: string | null;
  publicList: boolean;
}

export interface UpcomingBirthdayDto {
  userId: string;
  month: number;
  day: number;
  /** Days until the birthday from the guild-local "today" (0 = today). */
  inDays: number;
}

/** Dashboard summary — deliberately not a paginated table of every member's entry. */
export interface BirthdaySummaryDto extends BirthdayConfigDto {
  /** Number of members who have shared a birthday in this guild. */
  count: number;
  /** The next few upcoming birthdays (max 10). */
  next: UpcomingBirthdayDto[];
}

export type BirthdayConfigPatchDto = Partial<BirthdayConfigDto>;

export interface EconomySettingsDto {
  currencyName: string;
  currencySymbol: string;
  dailyMinAmount: number;
  dailyMaxAmount: number;
  streakBonusPerDay: number;
  streakBonusMax: number;
  giveMinAmount: number;
  giveMaxAmount: number;
}
