-- CreateEnum
CREATE TYPE "TagTriggerMode" AS ENUM ('NONE', 'EXACT', 'CONTAINS', 'STARTS_WITH');

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT,
    "embed" JSONB,
    "triggerMode" "TagTriggerMode" NOT NULL DEFAULT 'NONE',
    "trigger" TEXT,
    "triggerChannelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "staffOnly" BOOLEAN NOT NULL DEFAULT false,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tag_guildId_name_key" ON "Tag"("guildId", "name");

-- CreateIndex
CREATE INDEX "Tag_guildId_triggerMode_idx" ON "Tag"("guildId", "triggerMode");

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
