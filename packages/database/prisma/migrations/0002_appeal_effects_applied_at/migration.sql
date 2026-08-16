-- AlterTable
ALTER TABLE "ModerationAppeal" ADD COLUMN     "effectsAppliedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ModerationAppeal_status_effectsAppliedAt_idx" ON "ModerationAppeal"("status", "effectsAppliedAt");

