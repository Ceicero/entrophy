-- CreateEnum
CREATE TYPE "TwitchChatLevel" AS ENUM ('EVERYONE', 'SUBSCRIBER', 'VIP', 'MODERATOR', 'BROADCASTER');

-- CreateTable
CREATE TABLE "TwitchBotIdentity" (
    "id" TEXT NOT NULL,
    "botUserId" TEXT NOT NULL,
    "botLogin" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TwitchBotIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwitchChatChannel" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "broadcasterUserId" TEXT NOT NULL,
    "broadcasterLogin" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "lastError" TEXT,
    "lastConnectedAt" TIMESTAMP(3),
    "commandPrefix" TEXT NOT NULL DEFAULT '!',
    "connectionId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TwitchChatChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwitchChatCommand" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "cooldownSeconds" INTEGER NOT NULL DEFAULT 5,
    "minLevel" "TwitchChatLevel" NOT NULL DEFAULT 'EVERYONE',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TwitchChatCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwitchChatTimer" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "intervalMinutes" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastFiredAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TwitchChatTimer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TwitchBotIdentity_botUserId_key" ON "TwitchBotIdentity"("botUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TwitchChatChannel_connectionId_key" ON "TwitchChatChannel"("connectionId");

-- CreateIndex
CREATE INDEX "TwitchChatChannel_guildId_idx" ON "TwitchChatChannel"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "TwitchChatChannel_guildId_broadcasterUserId_key" ON "TwitchChatChannel"("guildId", "broadcasterUserId");

-- CreateIndex
CREATE INDEX "TwitchChatCommand_guildId_idx" ON "TwitchChatCommand"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "TwitchChatCommand_channelId_name_key" ON "TwitchChatCommand"("channelId", "name");

-- CreateIndex
CREATE INDEX "TwitchChatTimer_guildId_idx" ON "TwitchChatTimer"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "TwitchChatTimer_channelId_name_key" ON "TwitchChatTimer"("channelId", "name");

-- AddForeignKey
ALTER TABLE "TwitchChatChannel" ADD CONSTRAINT "TwitchChatChannel_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwitchChatChannel" ADD CONSTRAINT "TwitchChatChannel_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwitchChatCommand" ADD CONSTRAINT "TwitchChatCommand_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TwitchChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwitchChatCommand" ADD CONSTRAINT "TwitchChatCommand_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwitchChatTimer" ADD CONSTRAINT "TwitchChatTimer_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TwitchChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwitchChatTimer" ADD CONSTRAINT "TwitchChatTimer_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
