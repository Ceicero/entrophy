-- CreateTable
CREATE TABLE "StickyMessage" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "content" TEXT,
    "embed" JSONB,
    "cooldownSeconds" INTEGER NOT NULL DEFAULT 10,
    "lastMessageId" TEXT,
    "lastPostedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StickyMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StickyMessage_guildId_channelId_key" ON "StickyMessage"("guildId", "channelId");

-- CreateIndex
CREATE INDEX "StickyMessage_guildId_idx" ON "StickyMessage"("guildId");

-- AddForeignKey
ALTER TABLE "StickyMessage" ADD CONSTRAINT "StickyMessage_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
