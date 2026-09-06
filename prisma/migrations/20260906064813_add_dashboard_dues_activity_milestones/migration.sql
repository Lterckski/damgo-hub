-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('TASK_ASSIGNED', 'TASK_COMPLETED', 'PENALTY_ISSUED', 'PENALTY_RESOLVED', 'PENALTY_WAIVED', 'TRANSACTION_SUBMITTED', 'TRANSACTION_APPROVED', 'TRANSACTION_REJECTED', 'PROJECT_CREATED', 'PROJECT_STATUS_CHANGED', 'PROJECT_MEMBER_ADDED', 'DOC_CREATED', 'MEETING_SCHEDULED', 'AGENDA_PROPOSAL_SUBMITTED', 'AGENDA_PROPOSAL_ACCEPTED', 'AGENDA_PROPOSAL_DECLINED', 'ANNOUNCEMENT_POSTED', 'DUES_ASSESSED', 'MEMBER_JOINED');

-- CreateEnum
CREATE TYPE "DuesStatus" AS ENUM ('UNPAID', 'PAID', 'WAIVED');

-- CreateEnum
CREATE TYPE "HackathonEntryStatus" AS ENUM ('WATCHING', 'REGISTERED', 'SUBMITTED', 'WON', 'ELIMINATED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "PenaltyDisputeStatus" AS ENUM ('OPEN', 'ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "blockedReason" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "completedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "audienceMemberId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityLabel" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementDismissal" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuesPeriod" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DuesPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuesAssessment" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "DuesStatus" NOT NULL DEFAULT 'UNPAID',
    "paidAt" TIMESTAMP(3),
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DuesAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hackathon" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizer" TEXT,
    "url" TEXT,
    "registrationDeadline" TIMESTAMP(3),
    "submissionDeadline" TIMESTAMP(3),
    "eventStart" TIMESTAMP(3),
    "eventEnd" TIMESTAMP(3),
    "entryStatus" "HackathonEntryStatus" NOT NULL DEFAULT 'WATCHING',
    "projectId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hackathon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdeaVote" (
    "id" TEXT NOT NULL,
    "ideaNodeId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdeaVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PenaltyDispute" (
    "id" TEXT NOT NULL,
    "penaltyId" TEXT NOT NULL,
    "raisedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "PenaltyDisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PenaltyDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMilestone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityEvent_createdAt_idx" ON "ActivityEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_audienceMemberId_createdAt_idx" ON "ActivityEvent"("audienceMemberId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_type_createdAt_idx" ON "ActivityEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "Announcement_pinned_createdAt_idx" ON "Announcement"("pinned", "createdAt");

-- CreateIndex
CREATE INDEX "AnnouncementDismissal_memberId_idx" ON "AnnouncementDismissal"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementDismissal_announcementId_memberId_key" ON "AnnouncementDismissal"("announcementId", "memberId");

-- CreateIndex
CREATE INDEX "DuesPeriod_periodEnd_idx" ON "DuesPeriod"("periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "DuesPeriod_periodStart_periodEnd_key" ON "DuesPeriod"("periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "DuesAssessment_transactionId_key" ON "DuesAssessment"("transactionId");

-- CreateIndex
CREATE INDEX "DuesAssessment_memberId_status_idx" ON "DuesAssessment"("memberId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DuesAssessment_periodId_memberId_key" ON "DuesAssessment"("periodId", "memberId");

-- CreateIndex
CREATE INDEX "Hackathon_entryStatus_idx" ON "Hackathon"("entryStatus");

-- CreateIndex
CREATE INDEX "Hackathon_submissionDeadline_idx" ON "Hackathon"("submissionDeadline");

-- CreateIndex
CREATE INDEX "Hackathon_registrationDeadline_idx" ON "Hackathon"("registrationDeadline");

-- CreateIndex
CREATE INDEX "IdeaVote_ideaNodeId_idx" ON "IdeaVote"("ideaNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "IdeaVote_ideaNodeId_memberId_key" ON "IdeaVote"("ideaNodeId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "PenaltyDispute_penaltyId_key" ON "PenaltyDispute"("penaltyId");

-- CreateIndex
CREATE INDEX "PenaltyDispute_status_idx" ON "PenaltyDispute"("status");

-- CreateIndex
CREATE INDEX "ProjectMilestone_projectId_dueAt_idx" ON "ProjectMilestone"("projectId", "dueAt");

-- CreateIndex
CREATE INDEX "ProjectMilestone_completedAt_idx" ON "ProjectMilestone"("completedAt");

-- CreateIndex
CREATE INDEX "Task_completedAt_idx" ON "Task"("completedAt");

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_audienceMemberId_fkey" FOREIGN KEY ("audienceMemberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementDismissal" ADD CONSTRAINT "AnnouncementDismissal_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementDismissal" ADD CONSTRAINT "AnnouncementDismissal_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuesAssessment" ADD CONSTRAINT "DuesAssessment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "DuesPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuesAssessment" ADD CONSTRAINT "DuesAssessment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuesAssessment" ADD CONSTRAINT "DuesAssessment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hackathon" ADD CONSTRAINT "Hackathon_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hackathon" ADD CONSTRAINT "Hackathon_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaVote" ADD CONSTRAINT "IdeaVote_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenaltyDispute" ADD CONSTRAINT "PenaltyDispute_penaltyId_fkey" FOREIGN KEY ("penaltyId") REFERENCES "Penalty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenaltyDispute" ADD CONSTRAINT "PenaltyDispute_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMilestone" ADD CONSTRAINT "ProjectMilestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
