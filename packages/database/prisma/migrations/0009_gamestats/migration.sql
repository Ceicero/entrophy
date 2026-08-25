-- CreateEnum
CREATE TYPE "GameAccountProvider" AS ENUM ('STEAM');

-- CreateTable
CREATE TABLE "GameAccountLink" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "GameAccountProvider" NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameAccountLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameStatSnapshot" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "stats" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameStatSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameAccountLink_guildId_idx" ON "GameAccountLink"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "GameAccountLink_guildId_userId_provider_key" ON "GameAccountLink"("guildId", "userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "GameAccountLink_guildId_provider_externalId_key" ON "GameAccountLink"("guildId", "provider", "externalId");

-- CreateIndex
CREATE INDEX "GameStatSnapshot_guildId_game_idx" ON "GameStatSnapshot"("guildId", "game");

-- CreateIndex
CREATE UNIQUE INDEX "GameStatSnapshot_guildId_userId_game_key" ON "GameStatSnapshot"("guildId", "userId", "game");

-- AddForeignKey
ALTER TABLE "GameAccountLink" ADD CONSTRAINT "GameAccountLink_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameStatSnapshot" ADD CONSTRAINT "GameStatSnapshot_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

