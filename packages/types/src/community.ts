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

export type TagTriggerModeDto = 'NONE' | 'EXACT' | 'CONTAINS' | 'STARTS_WITH';

/** Flat embed payload stored on a tag (same shape as `/embed builder`'s `EmbedBuilderPayload`). */
export interface TagEmbedDto {
  title?: string;
  description?: string;
  colorHex?: string;
  imageUrl?: string;
  footer?: string;
}

/** A custom command (`/tag show <name>`) with its optional keyword auto-responder settings (spec CG-02). */
export interface TagDto {
  id: string;
  name: string;
  content: string | null;
  embed: TagEmbedDto | null;
  triggerMode: TagTriggerModeDto;
  trigger: string | null;
  triggerChannelIds: string[];
  staffOnly: boolean;
  uses: number;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Body for `POST`/`PUT /guilds/:guildId/community/tags` (validated by `tagBodySchema`). */
export interface TagBodyDto {
  name: string;
  content?: string | null;
  embed?: TagEmbedDto | null;
  triggerMode?: TagTriggerModeDto;
  trigger?: string | null;
  triggerChannelIds?: string[];
  staffOnly?: boolean;
}

/** The optional embed of a sticky message — same flat shape as `/embed builder`'s payload. */
export interface StickyEmbedDto {
  title?: string;
  description?: string;
  colorHex?: string;
  imageUrl?: string;
  footer?: string;
}

/** A staff message the bot keeps re-posting at the bottom of a channel (`/sticky set`). */
export interface StickyMessageDto {
  id: string;
  channelId: string;
  content: string | null;
  embed: StickyEmbedDto | null;
  cooldownSeconds: number;
  /** Id of the bot's current sticky post in the channel (null until first posted / after staff deleted it). */
  lastMessageId: string | null;
  lastPostedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

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
