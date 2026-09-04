-- CreateEnum
CREATE TYPE "AgendaProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "MeetingNotificationType" AS ENUM ('INVITATION', 'UPDATED', 'PARTICIPANT_REMOVED', 'MEETING_CANCELLED', 'REMINDER_24H', 'REMINDER_1H');

-- CreateEnum
CREATE TYPE "MeetingEmailDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "location" TEXT,
    "meetingUrl" TEXT,
    "organizerId" TEXT NOT NULL,
    "notificationRevision" INTEGER NOT NULL DEFAULT 1,
    "reminder24hRunId" TEXT,
    "reminder1hRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingParticipant" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendaProposal" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "proposedById" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "AgendaProposalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgendaProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendaItem" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "addedById" TEXT NOT NULL,
    "sourceProposalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgendaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingEmailDelivery" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "recipientMemberId" TEXT NOT NULL,
    "notificationType" "MeetingNotificationType" NOT NULL,
    "meetingRevision" INTEGER NOT NULL,
    "status" "MeetingEmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "providerMessageId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingEmailDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Meeting_scheduledAt_idx" ON "Meeting"("scheduledAt");

-- CreateIndex
CREATE INDEX "MeetingParticipant_memberId_idx" ON "MeetingParticipant"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingParticipant_meetingId_memberId_key" ON "MeetingParticipant"("meetingId", "memberId");

-- CreateIndex
CREATE INDEX "AgendaProposal_meetingId_idx" ON "AgendaProposal"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "AgendaItem_sourceProposalId_key" ON "AgendaItem"("sourceProposalId");

-- CreateIndex
CREATE INDEX "AgendaItem_meetingId_idx" ON "AgendaItem"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "AgendaItem_meetingId_position_key" ON "AgendaItem"("meetingId", "position");

-- CreateIndex
CREATE INDEX "MeetingEmailDelivery_meetingId_idx" ON "MeetingEmailDelivery"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingEmailDelivery_status_idx" ON "MeetingEmailDelivery"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingEmailDelivery_meetingId_recipientMemberId_notifica_key" ON "MeetingEmailDelivery"("meetingId", "recipientMemberId", "notificationType", "meetingRevision");

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaProposal" ADD CONSTRAINT "AgendaProposal_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaProposal" ADD CONSTRAINT "AgendaProposal_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaItem" ADD CONSTRAINT "AgendaItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaItem" ADD CONSTRAINT "AgendaItem_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaItem" ADD CONSTRAINT "AgendaItem_sourceProposalId_fkey" FOREIGN KEY ("sourceProposalId") REFERENCES "AgendaProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
