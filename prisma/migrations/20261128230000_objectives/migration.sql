-- CreateEnum
CREATE TYPE "ObjectiveCategory" AS ENUM ('STRATEGIC', 'QUALITY', 'CUSTOMER', 'ENVIRONMENT', 'CO2', 'SAFETY', 'HEALTH', 'PEOPLE', 'COMPLIANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "ObjectiveStatus" AS ENUM ('NOT_ASSESSED', 'ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'ACHIEVED', 'PARTIAL', 'NOT_ACHIEVED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "ActionSource" ADD VALUE 'OBJECTIVE';

-- AlterTable
ALTER TABLE "Action" ADD COLUMN     "objectiveId" TEXT;

-- CreateTable
CREATE TABLE "Objective" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "externalRef" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "ObjectiveCategory" NOT NULL,
    "indicator" TEXT,
    "baselineText" TEXT,
    "targetText" TEXT,
    "unit" TEXT,
    "baselineValue" DECIMAL(16,4),
    "targetValue" DECIMAL(16,4),
    "currentValue" DECIMAL(16,4),
    "startDate" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "termText" TEXT,
    "ownerId" TEXT,
    "ownerText" TEXT,
    "disciplineId" TEXT,
    "reductionTargetId" TEXT,
    "status" "ObjectiveStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
    "lastReviewDate" TIMESTAMP(3),
    "nextReviewDate" TIMESTAMP(3),
    "reviewIntervalMonths" INTEGER NOT NULL DEFAULT 3,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Objective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjectiveReview" (
    "id" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "ObjectiveStatus" NOT NULL,
    "currentValue" DECIMAL(16,4),
    "progressPct" INTEGER,
    "explanation" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObjectiveReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ObjectiveNorms" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ObjectiveNorms_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ObjectiveRequirements" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ObjectiveRequirements_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Objective_number_key" ON "Objective"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Objective_externalRef_key" ON "Objective"("externalRef");

-- CreateIndex
CREATE INDEX "Objective_category_status_idx" ON "Objective"("category", "status");

-- CreateIndex
CREATE INDEX "ObjectiveReview_objectiveId_date_idx" ON "ObjectiveReview"("objectiveId", "date");

-- CreateIndex
CREATE INDEX "_ObjectiveNorms_B_index" ON "_ObjectiveNorms"("B");

-- CreateIndex
CREATE INDEX "_ObjectiveRequirements_B_index" ON "_ObjectiveRequirements"("B");

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "Objective"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Objective" ADD CONSTRAINT "Objective_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Objective" ADD CONSTRAINT "Objective_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Objective" ADD CONSTRAINT "Objective_reductionTargetId_fkey" FOREIGN KEY ("reductionTargetId") REFERENCES "ReductionTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectiveReview" ADD CONSTRAINT "ObjectiveReview_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "Objective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectiveReview" ADD CONSTRAINT "ObjectiveReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ObjectiveNorms" ADD CONSTRAINT "_ObjectiveNorms_A_fkey" FOREIGN KEY ("A") REFERENCES "Norm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ObjectiveNorms" ADD CONSTRAINT "_ObjectiveNorms_B_fkey" FOREIGN KEY ("B") REFERENCES "Objective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ObjectiveRequirements" ADD CONSTRAINT "_ObjectiveRequirements_A_fkey" FOREIGN KEY ("A") REFERENCES "NormRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ObjectiveRequirements" ADD CONSTRAINT "_ObjectiveRequirements_B_fkey" FOREIGN KEY ("B") REFERENCES "Objective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

