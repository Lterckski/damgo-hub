/*
  Warnings:

  - Added the required column `startDate` to the `Task` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `Task` table without a default value. This is not possible if the table is not empty.
  - Made the column `dueDate` on table `Task` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "startDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "type" "FunctionalRole" NOT NULL,
ALTER COLUMN "dueDate" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Task_type_idx" ON "Task"("type");
