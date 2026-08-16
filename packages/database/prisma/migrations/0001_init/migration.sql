-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ModerationCaseType" AS ENUM ('WARN', 'TIMEOUT', 'UNTIMEOUT', 'KICK', 'BAN', 'UNBAN', 'SOFTBAN', 'PURGE', 'LOCK', 'UNLOCK', 'SLOWMODE', 'NICK', 'ROLE_ADD', 'ROLE_REMOVE', 'QUARANTINE', 'NOTE');

-- CreateEnum
CREATE TYPE "ActionSource" AS ENUM ('BOT', 'DASHBOARD', 'AUTOMOD', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DENIED');

-- CreateEnum
CREATE TYPE "AutomodRuleType" AS ENUM ('MESSAGE_FREQUENCY', 'DUPLICATE_MESSAGES', 'MENTION_SPAM', 'INVITE_LINKS', 'SCAM_LINKS', 'REGEX_FILTER', 'WORD_FILTER', 'CAPS', 'REPEATED_CHARS', 'ATTACHMENTS', 'NSFW_ENFORCEMENT', 'ACCOUNT_AGE', 'RAID_DETECTION');

-- CreateEnum
CREATE TYPE "AutomodReviewStatus" AS ENUM ('NONE', 'PENDING', 'CONFIRMED', 'FALSE_POSITIVE');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AuditSource" AS ENUM ('BOT', 'DASHBOARD', 'SYSTEM');

-- CreateEnum
CREATE TYPE "TicketMode" AS ENUM ('CHANNEL', 'THREAD');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RolePanelStyle" AS ENUM ('BUTTONS', 'SELECT', 'REACTIONS');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('BUTTON', 'MODAL', 'CAPTCHA', 'STAFF');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'IMPLEMENTED', 'CONSIDERING');

-- CreateEnum
CREATE TYPE "RsvpStatus" AS ENUM ('GOING', 'MAYBE', 'DECLINED');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('TWITCH', 'YOUTUBE', 'GITHUB', 'REDDIT', 'STEAM', 'GOOGLE_CALENDAR', 'MICROSOFT_CALENDAR', 'NOTION', 'STRIPE', 'OPENAI', 'ANTHROPIC', 'GENERIC_WEBHOOK');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR', 'PENDING');

-- CreateEnum
CREATE TYPE "WebhookDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "DataRequestType" AS ENUM ('EXPORT', 'DELETE');

-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "iconHash" TEXT,
    "ownerId" TEXT NOT NULL,
    "botPresent" BOOLEAN NOT NULL DEFAULT true,
    "memberCount" INTEGER,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "preferredLocale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "adminRoleIds" TEXT[],
    "modRoleIds" TEXT[],
    "helperRoleIds" TEXT[],
    "modLogChannelId" TEXT,
    "staffChannelId" TEXT,
    "appealsChannelId" TEXT,
    "fastActions" BOOLEAN NOT NULL DEFAULT false,
    "dataCollectionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "logMessageContent" BOOLEAN NOT NULL DEFAULT false,
    "dmOnModeration" BOOLEAN NOT NULL DEFAULT true,
    "setupCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PluginState" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PluginState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PluginConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PluginConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PluginMigration" (
    "id" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "migrationId" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PluginMigration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "username" TEXT,
    "globalName" TEXT,
    "avatarHash" TEXT,
    "locale" TEXT,
    "timezone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationCase" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "caseNumber" INTEGER NOT NULL,
    "type" "ModerationCaseType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "reason" TEXT,
    "evidenceUrls" TEXT[],
    "durationMs" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "dmSent" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "source" "ActionSource" NOT NULL,
    "automodRuleId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModerationCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationWarning" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "reason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "clearedAt" TIMESTAMP(3),
    "clearedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModerationWarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationNote" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModerationNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationAppeal" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "caseId" TEXT,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "staffMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModerationAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomodRule" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AutomodRuleType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "exemptRoleIds" TEXT[],
    "exemptChannelIds" TEXT[],
    "exemptUserIds" TEXT[],
    "trustedDomains" TEXT[],
    "cooldownSeconds" INTEGER NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomodRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomodEvent" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleType" "AutomodRuleType" NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT,
    "messageId" TEXT,
    "matched" TEXT,
    "actionsTaken" JSONB NOT NULL,
    "dryRun" BOOLEAN NOT NULL,
    "riskScore" DOUBLE PRECISION,
    "reviewStatus" "AutomodReviewStatus" NOT NULL DEFAULT 'NONE',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomodEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "source" "AuditSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogEvent" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actorId" TEXT,
    "targetId" TEXT,
    "channelId" TEXT,
    "messageId" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "openerId" TEXT NOT NULL,
    "channelId" TEXT,
    "threadId" TEXT,
    "mode" "TicketMode" NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "subject" TEXT,
    "intake" JSONB,
    "tags" TEXT[],
    "assigneeId" TEXT,
    "panelId" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "closeReason" TEXT,
    "slaDueAt" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketParticipant" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketTranscript" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "htmlContent" TEXT,
    "jsonContent" JSONB,
    "messageCount" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "TicketTranscript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketPanel" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "buttonLabel" TEXT NOT NULL,
    "categoryId" TEXT,
    "supportRoleIds" TEXT[],
    "mode" "TicketMode" NOT NULL,
    "intakeForm" JSONB,
    "slaMinutes" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketPanel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePanel" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "style" "RolePanelStyle" NOT NULL,
    "groupId" TEXT,
    "maxSelections" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePanel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePanelOption" (
    "id" TEXT NOT NULL,
    "panelId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "emoji" TEXT,
    "description" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePanelOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleGroup" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roleIds" TEXT[],
    "maxSelections" INTEGER,
    "exclusive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberRoleSnapshot" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleIds" TEXT[],
    "leftAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberRoleSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationRequest" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answers" JSONB,
    "method" "VerificationMethod" NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "staffMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingProgress" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "rulesAcceptedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledJob" (
    "id" TEXT NOT NULL,
    "guildId" TEXT,
    "pluginId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "bullJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "guildId" TEXT,
    "userId" TEXT NOT NULL,
    "channelId" TEXT,
    "content" TEXT NOT NULL,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "recurring" TEXT,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledAnnouncement" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "cron" TEXT,
    "runAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Giveaway" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "prize" TEXT NOT NULL,
    "winnerCount" INTEGER NOT NULL,
    "hostId" TEXT NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "ended" BOOLEAN NOT NULL DEFAULT false,
    "requiredRoleIds" TEXT[],
    "minAccountAgeDays" INTEGER,
    "minLevel" INTEGER,
    "winnerIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Giveaway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiveawayEntry" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiveawayEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Poll" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "question" TEXT NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "multiSelect" BOOLEAN NOT NULL DEFAULT false,
    "endsAt" TIMESTAMP(3),
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollOption" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "emoji" TEXT,

    CONSTRAINT "PollOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollVote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suggestion" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "authorId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "content" TEXT NOT NULL,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "staffNote" TEXT,
    "threadId" TEXT,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "downvotes" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuggestionVote" (
    "id" TEXT NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuggestionVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StarboardEntry" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "sourceMessageId" TEXT NOT NULL,
    "sourceChannelId" TEXT NOT NULL,
    "starboardMessageId" TEXT,
    "authorId" TEXT NOT NULL,
    "starCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StarboardEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TempVoiceChannel" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "hubChannelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TempVoiceChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityEvent" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "channelId" TEXT,
    "messageId" TEXT,
    "hostId" TEXT NOT NULL,
    "discordEventId" TEXT,
    "reminderMinutes" INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRsvp" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "RsvpStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventRsvp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LevelProfile" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 0,
    "messages" INTEGER NOT NULL DEFAULT 0,
    "lastXpAt" TIMESTAMP(3),
    "voiceMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LevelProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LevelReward" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LevelReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReputationEvent" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReputationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EconomyAccount" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "lastDailyAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EconomyAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EconomyTransaction" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "accountId" TEXT,
    "fromUserId" TEXT,
    "toUserId" TEXT,
    "amount" BIGINT NOT NULL,
    "type" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EconomyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AfkStatus" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT,
    "since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AfkStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "label" TEXT,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "config" JSONB NOT NULL,
    "externalAccountId" TEXT,
    "externalAccountName" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "connectedBy" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthToken" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT,
    "tokenType" TEXT,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3),
    "rotatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "direction" "WebhookDirection" NOT NULL,
    "provider" TEXT,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "secretEnc" TEXT NOT NULL,
    "events" TEXT[],
    "channelId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastDeliveryAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "direction" "WebhookDirection" NOT NULL,
    "status" INTEGER,
    "success" BOOLEAN NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "error" TEXT,
    "payloadHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataRetentionPolicy" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "auditLogDays" INTEGER NOT NULL DEFAULT 365,
    "logEventDays" INTEGER NOT NULL DEFAULT 90,
    "moderationCaseDays" INTEGER,
    "automodEventDays" INTEGER NOT NULL DEFAULT 90,
    "ticketTranscriptDays" INTEGER NOT NULL DEFAULT 90,
    "levelInactivityDays" INTEGER,
    "analyticsDays" INTEGER NOT NULL DEFAULT 365,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataRetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataRequest" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "type" "DataRequestType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT NOT NULL,
    "resultUrl" TEXT,
    "resultExpiresAt" TIMESTAMP(3),
    "error" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildAnalyticsDaily" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "joins" INTEGER NOT NULL DEFAULT 0,
    "leaves" INTEGER NOT NULL DEFAULT 0,
    "memberCount" INTEGER,
    "messages" INTEGER NOT NULL DEFAULT 0,
    "moderationActions" INTEGER NOT NULL DEFAULT 0,
    "automodTriggers" INTEGER NOT NULL DEFAULT 0,
    "ticketsOpened" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildAnalyticsDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuildConfig_guildId_key" ON "GuildConfig"("guildId");

-- CreateIndex
CREATE INDEX "GuildConfig_guildId_idx" ON "GuildConfig"("guildId");

-- CreateIndex
CREATE INDEX "PluginState_guildId_idx" ON "PluginState"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "PluginState_guildId_pluginId_key" ON "PluginState"("guildId", "pluginId");

-- CreateIndex
CREATE INDEX "PluginConfig_guildId_idx" ON "PluginConfig"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "PluginConfig_guildId_pluginId_key" ON "PluginConfig"("guildId", "pluginId");

-- CreateIndex
CREATE UNIQUE INDEX "PluginMigration_pluginId_migrationId_key" ON "PluginMigration"("pluginId", "migrationId");

-- CreateIndex
CREATE INDEX "ModerationCase_guildId_idx" ON "ModerationCase"("guildId");

-- CreateIndex
CREATE INDEX "ModerationCase_guildId_targetId_idx" ON "ModerationCase"("guildId", "targetId");

-- CreateIndex
CREATE INDEX "ModerationCase_guildId_moderatorId_idx" ON "ModerationCase"("guildId", "moderatorId");

-- CreateIndex
CREATE INDEX "ModerationCase_guildId_type_idx" ON "ModerationCase"("guildId", "type");

-- CreateIndex
CREATE INDEX "ModerationCase_expiresAt_idx" ON "ModerationCase"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ModerationCase_guildId_caseNumber_key" ON "ModerationCase"("guildId", "caseNumber");

-- CreateIndex
CREATE INDEX "ModerationWarning_guildId_idx" ON "ModerationWarning"("guildId");

-- CreateIndex
CREATE INDEX "ModerationWarning_guildId_userId_active_idx" ON "ModerationWarning"("guildId", "userId", "active");

-- CreateIndex
CREATE INDEX "ModerationNote_guildId_idx" ON "ModerationNote"("guildId");

-- CreateIndex
CREATE INDEX "ModerationNote_guildId_userId_idx" ON "ModerationNote"("guildId", "userId");

-- CreateIndex
CREATE INDEX "ModerationAppeal_guildId_idx" ON "ModerationAppeal"("guildId");

-- CreateIndex
CREATE INDEX "ModerationAppeal_guildId_status_idx" ON "ModerationAppeal"("guildId", "status");

-- CreateIndex
CREATE INDEX "AutomodRule_guildId_idx" ON "AutomodRule"("guildId");

-- CreateIndex
CREATE INDEX "AutomodEvent_guildId_idx" ON "AutomodEvent"("guildId");

-- CreateIndex
CREATE INDEX "AutomodEvent_guildId_createdAt_idx" ON "AutomodEvent"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomodEvent_guildId_reviewStatus_idx" ON "AutomodEvent"("guildId", "reviewStatus");

-- CreateIndex
CREATE INDEX "AuditLog_guildId_idx" ON "AuditLog"("guildId");

-- CreateIndex
CREATE INDEX "AuditLog_guildId_createdAt_idx" ON "AuditLog"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_guildId_action_idx" ON "AuditLog"("guildId", "action");

-- CreateIndex
CREATE INDEX "AuditLog_guildId_actorId_idx" ON "AuditLog"("guildId", "actorId");

-- CreateIndex
CREATE INDEX "LogEvent_guildId_idx" ON "LogEvent"("guildId");

-- CreateIndex
CREATE INDEX "LogEvent_guildId_kind_createdAt_idx" ON "LogEvent"("guildId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "Ticket_guildId_idx" ON "Ticket"("guildId");

-- CreateIndex
CREATE INDEX "Ticket_guildId_status_idx" ON "Ticket"("guildId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_guildId_number_key" ON "Ticket"("guildId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "TicketParticipant_ticketId_userId_key" ON "TicketParticipant"("ticketId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketTranscript_ticketId_key" ON "TicketTranscript"("ticketId");

-- CreateIndex
CREATE INDEX "TicketPanel_guildId_idx" ON "TicketPanel"("guildId");

-- CreateIndex
CREATE INDEX "RolePanel_guildId_idx" ON "RolePanel"("guildId");

-- CreateIndex
CREATE INDEX "RolePanelOption_panelId_idx" ON "RolePanelOption"("panelId");

-- CreateIndex
CREATE INDEX "RoleGroup_guildId_idx" ON "RoleGroup"("guildId");

-- CreateIndex
CREATE INDEX "MemberRoleSnapshot_guildId_idx" ON "MemberRoleSnapshot"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberRoleSnapshot_guildId_userId_key" ON "MemberRoleSnapshot"("guildId", "userId");

-- CreateIndex
CREATE INDEX "VerificationRequest_guildId_idx" ON "VerificationRequest"("guildId");

-- CreateIndex
CREATE INDEX "VerificationRequest_guildId_status_idx" ON "VerificationRequest"("guildId", "status");

-- CreateIndex
CREATE INDEX "OnboardingProgress_guildId_idx" ON "OnboardingProgress"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingProgress_guildId_userId_key" ON "OnboardingProgress"("guildId", "userId");

-- CreateIndex
CREATE INDEX "ScheduledJob_guildId_idx" ON "ScheduledJob"("guildId");

-- CreateIndex
CREATE INDEX "ScheduledJob_status_runAt_idx" ON "ScheduledJob"("status", "runAt");

-- CreateIndex
CREATE INDEX "Reminder_guildId_idx" ON "Reminder"("guildId");

-- CreateIndex
CREATE INDEX "Reminder_remindAt_delivered_idx" ON "Reminder"("remindAt", "delivered");

-- CreateIndex
CREATE INDEX "ScheduledAnnouncement_guildId_idx" ON "ScheduledAnnouncement"("guildId");

-- CreateIndex
CREATE INDEX "Giveaway_guildId_idx" ON "Giveaway"("guildId");

-- CreateIndex
CREATE INDEX "Giveaway_ended_endsAt_idx" ON "Giveaway"("ended", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "GiveawayEntry_giveawayId_userId_key" ON "GiveawayEntry"("giveawayId", "userId");

-- CreateIndex
CREATE INDEX "Poll_guildId_idx" ON "Poll"("guildId");

-- CreateIndex
CREATE INDEX "PollOption_pollId_idx" ON "PollOption"("pollId");

-- CreateIndex
CREATE UNIQUE INDEX "PollVote_pollId_optionId_userId_key" ON "PollVote"("pollId", "optionId", "userId");

-- CreateIndex
CREATE INDEX "Suggestion_guildId_idx" ON "Suggestion"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "Suggestion_guildId_number_key" ON "Suggestion"("guildId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "SuggestionVote_suggestionId_userId_key" ON "SuggestionVote"("suggestionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "StarboardEntry_sourceMessageId_key" ON "StarboardEntry"("sourceMessageId");

-- CreateIndex
CREATE INDEX "StarboardEntry_guildId_idx" ON "StarboardEntry"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "TempVoiceChannel_channelId_key" ON "TempVoiceChannel"("channelId");

-- CreateIndex
CREATE INDEX "TempVoiceChannel_guildId_idx" ON "TempVoiceChannel"("guildId");

-- CreateIndex
CREATE INDEX "CommunityEvent_guildId_idx" ON "CommunityEvent"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "EventRsvp_eventId_userId_key" ON "EventRsvp"("eventId", "userId");

-- CreateIndex
CREATE INDEX "LevelProfile_guildId_xp_idx" ON "LevelProfile"("guildId", "xp");

-- CreateIndex
CREATE INDEX "LevelProfile_guildId_idx" ON "LevelProfile"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "LevelProfile_guildId_userId_key" ON "LevelProfile"("guildId", "userId");

-- CreateIndex
CREATE INDEX "LevelReward_guildId_idx" ON "LevelReward"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "LevelReward_guildId_level_roleId_key" ON "LevelReward"("guildId", "level", "roleId");

-- CreateIndex
CREATE INDEX "ReputationEvent_guildId_idx" ON "ReputationEvent"("guildId");

-- CreateIndex
CREATE INDEX "ReputationEvent_guildId_toUserId_idx" ON "ReputationEvent"("guildId", "toUserId");

-- CreateIndex
CREATE INDEX "ReputationEvent_guildId_fromUserId_createdAt_idx" ON "ReputationEvent"("guildId", "fromUserId", "createdAt");

-- CreateIndex
CREATE INDEX "EconomyAccount_guildId_idx" ON "EconomyAccount"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "EconomyAccount_guildId_userId_key" ON "EconomyAccount"("guildId", "userId");

-- CreateIndex
CREATE INDEX "EconomyTransaction_guildId_idx" ON "EconomyTransaction"("guildId");

-- CreateIndex
CREATE INDEX "EconomyTransaction_guildId_createdAt_idx" ON "EconomyTransaction"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "AfkStatus_guildId_idx" ON "AfkStatus"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "AfkStatus_guildId_userId_key" ON "AfkStatus"("guildId", "userId");

-- CreateIndex
CREATE INDEX "IntegrationConnection_guildId_idx" ON "IntegrationConnection"("guildId");

-- CreateIndex
CREATE INDEX "IntegrationConnection_guildId_provider_idx" ON "IntegrationConnection"("guildId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthToken_connectionId_key" ON "OAuthToken"("connectionId");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_guildId_idx" ON "WebhookEndpoint"("guildId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_endpointId_createdAt_idx" ON "WebhookDelivery"("endpointId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedWebhookEvent_provider_eventId_key" ON "ProcessedWebhookEvent"("provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "DataRetentionPolicy_guildId_key" ON "DataRetentionPolicy"("guildId");

-- CreateIndex
CREATE INDEX "DataRetentionPolicy_guildId_idx" ON "DataRetentionPolicy"("guildId");

-- CreateIndex
CREATE INDEX "DataRequest_guildId_idx" ON "DataRequest"("guildId");

-- CreateIndex
CREATE INDEX "AiUsage_guildId_idx" ON "AiUsage"("guildId");

-- CreateIndex
CREATE INDEX "AiUsage_guildId_createdAt_idx" ON "AiUsage"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsage_guildId_userId_createdAt_idx" ON "AiUsage"("guildId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "GuildAnalyticsDaily_guildId_idx" ON "GuildAnalyticsDaily"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "GuildAnalyticsDaily_guildId_date_key" ON "GuildAnalyticsDaily"("guildId", "date");

-- AddForeignKey
ALTER TABLE "GuildConfig" ADD CONSTRAINT "GuildConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginState" ADD CONSTRAINT "PluginState_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginConfig" ADD CONSTRAINT "PluginConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationWarning" ADD CONSTRAINT "ModerationWarning_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationWarning" ADD CONSTRAINT "ModerationWarning_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ModerationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationNote" ADD CONSTRAINT "ModerationNote_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAppeal" ADD CONSTRAINT "ModerationAppeal_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAppeal" ADD CONSTRAINT "ModerationAppeal_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ModerationCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomodRule" ADD CONSTRAINT "AutomodRule_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomodEvent" ADD CONSTRAINT "AutomodEvent_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomodEvent" ADD CONSTRAINT "AutomodEvent_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomodRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogEvent" ADD CONSTRAINT "LogEvent_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketParticipant" ADD CONSTRAINT "TicketParticipant_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTranscript" ADD CONSTRAINT "TicketTranscript_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketPanel" ADD CONSTRAINT "TicketPanel_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePanel" ADD CONSTRAINT "RolePanel_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePanelOption" ADD CONSTRAINT "RolePanelOption_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "RolePanel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleGroup" ADD CONSTRAINT "RoleGroup_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberRoleSnapshot" ADD CONSTRAINT "MemberRoleSnapshot_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingProgress" ADD CONSTRAINT "OnboardingProgress_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledJob" ADD CONSTRAINT "ScheduledJob_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledAnnouncement" ADD CONSTRAINT "ScheduledAnnouncement_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Giveaway" ADD CONSTRAINT "Giveaway_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiveawayEntry" ADD CONSTRAINT "GiveawayEntry_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollOption" ADD CONSTRAINT "PollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "PollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestionVote" ADD CONSTRAINT "SuggestionVote_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "Suggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StarboardEntry" ADD CONSTRAINT "StarboardEntry_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TempVoiceChannel" ADD CONSTRAINT "TempVoiceChannel_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityEvent" ADD CONSTRAINT "CommunityEvent_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRsvp" ADD CONSTRAINT "EventRsvp_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CommunityEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LevelProfile" ADD CONSTRAINT "LevelProfile_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LevelReward" ADD CONSTRAINT "LevelReward_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReputationEvent" ADD CONSTRAINT "ReputationEvent_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomyAccount" ADD CONSTRAINT "EconomyAccount_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomyTransaction" ADD CONSTRAINT "EconomyTransaction_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EconomyTransaction" ADD CONSTRAINT "EconomyTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EconomyAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfkStatus" ADD CONSTRAINT "AfkStatus_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthToken" ADD CONSTRAINT "OAuthToken_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataRetentionPolicy" ADD CONSTRAINT "DataRetentionPolicy_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataRequest" ADD CONSTRAINT "DataRequest_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildAnalyticsDaily" ADD CONSTRAINT "GuildAnalyticsDaily_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

