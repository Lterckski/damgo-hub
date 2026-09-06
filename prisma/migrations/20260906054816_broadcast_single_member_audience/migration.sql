-- AlterEnum
ALTER TYPE "BroadcastAudience" ADD VALUE 'MEMBER';

-- AlterTable
ALTER TABLE "Broadcast" ADD COLUMN     "audienceMemberId" TEXT;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_audienceMemberId_fkey" FOREIGN KEY ("audienceMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
