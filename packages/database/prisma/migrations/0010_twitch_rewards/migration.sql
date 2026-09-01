-- CreateEnum
CREATE TYPE "TwitchRewardActionKind" AS ENUM ('SOUND', 'TTS', 'CHAT', 'DISCORD');

-- AlterTable
ALTER TABLE "TwitchChatChannel" ADD COLUMN     "overlayTokenEnc" TEXT,
ADD COLUMN     "rewardsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TwitchChatReward" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "rewardId" TEXT,
    "rewardTitle" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "action" "TwitchRewardActionKind" NOT NULL,
    "soundUrl" TEXT,
    "volume" INTEGER NOT NULL DEFAULT 80,
    "ttsTemplate" TEXT,
    "chatTemplate" TEXT,
    "discordChannelId" TEXT,
    "discordTemplate" TEXT,
    "cooldownSeconds" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TwitchChatReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TwitchChatReward_guildId_idx" ON "TwitchChatReward"("guildId");

-- CreateIndex
CREATE INDEX "TwitchChatReward_channelId_idx" ON "TwitchChatReward"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "TwitchChatReward_channelId_rewardTitle_action_key" ON "TwitchChatReward"("channelId", "rewardTitle", "action");

-- AddForeignKey
ALTER TABLE "TwitchChatReward" ADD CONSTRAINT "TwitchChatReward_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TwitchChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwitchChatReward" ADD CONSTRAINT "TwitchChatReward_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

