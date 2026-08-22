-- CreateEnum
CREATE TYPE "DeveloperReportKind" AS ENUM ('BUG', 'FEEDBACK', 'QUESTION');

-- CreateEnum
CREATE TYPE "DeveloperReportStatus" AS ENUM ('OPEN', 'HANDLED');

-- CreateTable
CREATE TABLE "DeveloperReport" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "guildName" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderTag" TEXT NOT NULL,
    "kind" "DeveloperReportKind" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "botVersion" TEXT NOT NULL,
    "status" "DeveloperReportStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "handledAt" TIMESTAMP(3),
    "handledBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeveloperReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeveloperReport_guildId_idx" ON "DeveloperReport"("guildId");

-- CreateIndex
CREATE INDEX "DeveloperReport_status_createdAt_idx" ON "DeveloperReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DeveloperReport_kind_createdAt_idx" ON "DeveloperReport"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "DeveloperReport_senderId_idx" ON "DeveloperReport"("senderId");

-- AddForeignKey
ALTER TABLE "DeveloperReport" ADD CONSTRAINT "DeveloperReport_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

