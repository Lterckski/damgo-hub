-- CreateEnum
CREATE TYPE "ProjectPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ProjectCategory" AS ENUM ('FEATURE', 'RESEARCH', 'INTERNAL_TOOL', 'HACKATHON_ENTRY', 'OTHER');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "category" "ProjectCategory",
ADD COLUMN     "estimatedBudgetCentavos" INTEGER,
ADD COLUMN     "objectives" TEXT,
ADD COLUMN     "priority" "ProjectPriority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "targetEndDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProjectLink" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskDocument" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "docId" TEXT NOT NULL,

    CONSTRAINT "TaskDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectLink_projectId_idx" ON "ProjectLink"("projectId");

-- CreateIndex
CREATE INDEX "TaskDocument_taskId_idx" ON "TaskDocument"("taskId");

-- CreateIndex
CREATE INDEX "TaskDocument_docId_idx" ON "TaskDocument"("docId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskDocument_taskId_docId_key" ON "TaskDocument"("taskId", "docId");

-- AddForeignKey
ALTER TABLE "ProjectLink" ADD CONSTRAINT "ProjectLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDocument" ADD CONSTRAINT "TaskDocument_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDocument" ADD CONSTRAINT "TaskDocument_docId_fkey" FOREIGN KEY ("docId") REFERENCES "Doc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
