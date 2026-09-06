-- CreateEnum
CREATE TYPE "AuditEntityType" AS ENUM ('MEMBER', 'TRANSACTION', 'PENALTY', 'PROJECT', 'TASK', 'MEETING', 'AGENDA_PROPOSAL', 'MEMBER_REQUEST', 'BROADCAST', 'ORG_SETTINGS');

-- CreateEnum
CREATE TYPE "BroadcastAudience" AS ENUM ('ALL_MEMBERS', 'ROLE', 'PROJECT');

-- CreateEnum
CREATE TYPE "MemberRequestType" AS ENUM ('JOIN', 'ROLE_CHANGE');

-- CreateEnum
CREATE TYPE "MemberRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- CreateEnum
CREATE TYPE "MeetingCadence" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'AD_HOC');

-- CreateEnum
CREATE TYPE "InvitePolicy" AS ENUM ('ADMIN_ONLY', 'ANY_MEMBER');

-- AlterEnum
ALTER TYPE "MemberStatus" ADD VALUE 'REMOVED';

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_penaltyId_fkey";

-- AlterTable
ALTER TABLE "Penalty" ADD COLUMN     "dueAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorClerkUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" "AuditEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityLabel" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" "BroadcastAudience" NOT NULL,
    "audienceRole" TEXT,
    "projectId" TEXT,
    "sentById" TEXT,
    "sentByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastRecipient" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "BroadcastRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberRequest" (
    "id" TEXT NOT NULL,
    "type" "MemberRequestType" NOT NULL,
    "status" "MemberRequestStatus" NOT NULL DEFAULT 'PENDING',
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "clerkUserId" TEXT,
    "memberId" TEXT,
    "requestedRole" TEXT,
    "message" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "penaltyRules" JSONB NOT NULL DEFAULT '[]',
    "penaltyDueDays" INTEGER NOT NULL DEFAULT 14,
    "financeCategories" TEXT[] DEFAULT ARRAY['Dues', 'Sponsorship', 'Supplies', 'Travel', 'Registration', 'Penalty', 'Other']::TEXT[],
    "meetingCadence" "MeetingCadence" NOT NULL DEFAULT 'WEEKLY',
    "invitePolicy" "InvitePolicy" NOT NULL DEFAULT 'ADMIN_ONLY',
    "projectStaleDays" INTEGER NOT NULL DEFAULT 14,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "OrgSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "Broadcast_createdAt_idx" ON "Broadcast"("createdAt");

-- CreateIndex
CREATE INDEX "BroadcastRecipient_memberId_readAt_idx" ON "BroadcastRecipient"("memberId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastRecipient_broadcastId_memberId_key" ON "BroadcastRecipient"("broadcastId", "memberId");

-- CreateIndex
CREATE INDEX "MemberRequest_status_createdAt_idx" ON "MemberRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MemberRequest_memberId_idx" ON "MemberRequest"("memberId");

-- CreateIndex
CREATE INDEX "Member_email_idx" ON "Member"("email");

-- CreateIndex
CREATE INDEX "Penalty_status_dueAt_idx" ON "Penalty"("status", "dueAt");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastRecipient" ADD CONSTRAINT "BroadcastRecipient_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastRecipient" ADD CONSTRAINT "BroadcastRecipient_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberRequest" ADD CONSTRAINT "MemberRequest_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberRequest" ADD CONSTRAINT "MemberRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_penaltyId_fkey" FOREIGN KEY ("penaltyId") REFERENCES "Penalty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "MeetingEmailDelivery_meetingId_recipientMemberId_notifica_key" RENAME TO "MeetingEmailDelivery_meetingId_recipientMemberId_notificati_key";
