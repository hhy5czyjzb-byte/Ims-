-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('NOT_ASSESSED', 'COMPLIANT', 'PARTIAL', 'NON_COMPLIANT', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "LegalCategory" AS ENUM ('ENVIRONMENT', 'HEALTH_SAFETY', 'PRODUCT', 'ENERGY_CO2', 'BUILDING', 'OTHER');

-- AlterTable
ALTER TABLE "Action" ADD COLUMN     "legalRequirementId" TEXT;

-- CreateTable
CREATE TABLE "LegalRequirement" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "externalRef" TEXT,
    "title" TEXT NOT NULL,
    "article" TEXT,
    "subject" TEXT,
    "description" TEXT,
    "source" TEXT,
    "sourceUrl" TEXT,
    "category" "LegalCategory" NOT NULL DEFAULT 'OTHER',
    "status" "ComplianceStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
    "explanation" TEXT,
    "lastReviewDate" TIMESTAMP(3),
    "nextReviewDate" TIMESTAMP(3),
    "reviewIntervalMonths" INTEGER NOT NULL DEFAULT 12,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "ownerId" TEXT,
    "createdById" TEXT,
    "disciplineId" TEXT,
    "locationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceAssessment" (
    "id" TEXT NOT NULL,
    "legalRequirementId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "ComplianceStatus" NOT NULL,
    "explanation" TEXT,
    "assessedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_LegalDocuments" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_LegalDocuments_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_LegalProcesses" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_LegalProcesses_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_LegalRisks" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_LegalRisks_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_LegalNormRequirements" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_LegalNormRequirements_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "LegalRequirement_number_key" ON "LegalRequirement"("number");

-- CreateIndex
CREATE UNIQUE INDEX "LegalRequirement_externalRef_key" ON "LegalRequirement"("externalRef");

-- CreateIndex
CREATE INDEX "LegalRequirement_status_idx" ON "LegalRequirement"("status");

-- CreateIndex
CREATE INDEX "LegalRequirement_nextReviewDate_idx" ON "LegalRequirement"("nextReviewDate");

-- CreateIndex
CREATE INDEX "ComplianceAssessment_legalRequirementId_date_idx" ON "ComplianceAssessment"("legalRequirementId", "date");

-- CreateIndex
CREATE INDEX "_LegalDocuments_B_index" ON "_LegalDocuments"("B");

-- CreateIndex
CREATE INDEX "_LegalProcesses_B_index" ON "_LegalProcesses"("B");

-- CreateIndex
CREATE INDEX "_LegalRisks_B_index" ON "_LegalRisks"("B");

-- CreateIndex
CREATE INDEX "_LegalNormRequirements_B_index" ON "_LegalNormRequirements"("B");

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_legalRequirementId_fkey" FOREIGN KEY ("legalRequirementId") REFERENCES "LegalRequirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalRequirement" ADD CONSTRAINT "LegalRequirement_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalRequirement" ADD CONSTRAINT "LegalRequirement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalRequirement" ADD CONSTRAINT "LegalRequirement_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalRequirement" ADD CONSTRAINT "LegalRequirement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceAssessment" ADD CONSTRAINT "ComplianceAssessment_legalRequirementId_fkey" FOREIGN KEY ("legalRequirementId") REFERENCES "LegalRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceAssessment" ADD CONSTRAINT "ComplianceAssessment_assessedById_fkey" FOREIGN KEY ("assessedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LegalDocuments" ADD CONSTRAINT "_LegalDocuments_A_fkey" FOREIGN KEY ("A") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LegalDocuments" ADD CONSTRAINT "_LegalDocuments_B_fkey" FOREIGN KEY ("B") REFERENCES "LegalRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LegalProcesses" ADD CONSTRAINT "_LegalProcesses_A_fkey" FOREIGN KEY ("A") REFERENCES "LegalRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LegalProcesses" ADD CONSTRAINT "_LegalProcesses_B_fkey" FOREIGN KEY ("B") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LegalRisks" ADD CONSTRAINT "_LegalRisks_A_fkey" FOREIGN KEY ("A") REFERENCES "LegalRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LegalRisks" ADD CONSTRAINT "_LegalRisks_B_fkey" FOREIGN KEY ("B") REFERENCES "Risk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LegalNormRequirements" ADD CONSTRAINT "_LegalNormRequirements_A_fkey" FOREIGN KEY ("A") REFERENCES "LegalRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LegalNormRequirements" ADD CONSTRAINT "_LegalNormRequirements_B_fkey" FOREIGN KEY ("B") REFERENCES "NormRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

