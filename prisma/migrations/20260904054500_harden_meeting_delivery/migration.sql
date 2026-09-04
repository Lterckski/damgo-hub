-- AddEnumValue
ALTER TYPE "MeetingEmailDeliveryStatus" ADD VALUE 'SKIPPED';

-- CreateEnum
CREATE TYPE "MeetingNotificationOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTER');

-- CreateTable
CREATE TABLE "MeetingNotificationOutbox" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "notificationType" "MeetingNotificationType" NOT NULL,
    "meetingRevision" INTEGER NOT NULL,
    "recipientMemberIds" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "status" "MeetingNotificationOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingNotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- Indexes on the new, initially empty outbox table do not need concurrent creation.
CREATE INDEX "MeetingNotificationOutbox_meetingId_idx" ON "MeetingNotificationOutbox"("meetingId");
CREATE INDEX "MeetingNotificationOutbox_status_updatedAt_idx" ON "MeetingNotificationOutbox"("status", "updatedAt");
