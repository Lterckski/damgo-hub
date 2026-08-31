/*
  Warnings:

  - You are about to drop the column `role` on the `Member` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "FunctionalRole" AS ENUM ('PITCHING', 'DOCUMENTS', 'CREATIVES', 'PRODUCTION', 'QUALITY_ASSURANCE', 'MARKETING', 'MODEL');

-- CreateEnum
CREATE TYPE "WorkDistributionRole" AS ENUM ('HACKATHON_HUNTER', 'PROJECT_SCAVENGER_CREATOR');

-- DropIndex
DROP INDEX "Member_role_idx";

-- AlterTable
ALTER TABLE "Member" DROP COLUMN "role",
ADD COLUMN     "isLeader" BOOLEAN NOT NULL DEFAULT false;

-- DropEnum
DROP TYPE "MemberRole";

-- CreateTable
CREATE TABLE "MemberFunctionalRole" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "role" "FunctionalRole" NOT NULL,

    CONSTRAINT "MemberFunctionalRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberWorkDistributionRole" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "role" "WorkDistributionRole" NOT NULL,

    CONSTRAINT "MemberWorkDistributionRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberFunctionalRole_role_idx" ON "MemberFunctionalRole"("role");

-- CreateIndex
CREATE UNIQUE INDEX "MemberFunctionalRole_memberId_role_key" ON "MemberFunctionalRole"("memberId", "role");

-- CreateIndex
CREATE INDEX "MemberWorkDistributionRole_role_idx" ON "MemberWorkDistributionRole"("role");

-- CreateIndex
CREATE UNIQUE INDEX "MemberWorkDistributionRole_memberId_role_key" ON "MemberWorkDistributionRole"("memberId", "role");

-- AddForeignKey
ALTER TABLE "MemberFunctionalRole" ADD CONSTRAINT "MemberFunctionalRole_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberWorkDistributionRole" ADD CONSTRAINT "MemberWorkDistributionRole_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
