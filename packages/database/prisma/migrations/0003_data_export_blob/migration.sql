-- CreateTable
CREATE TABLE "DataExportBlob" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataExportBlob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DataExportBlob_requestId_key" ON "DataExportBlob"("requestId");

-- CreateIndex
CREATE INDEX "DataExportBlob_guildId_idx" ON "DataExportBlob"("guildId");

-- AddForeignKey
ALTER TABLE "DataExportBlob" ADD CONSTRAINT "DataExportBlob_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

