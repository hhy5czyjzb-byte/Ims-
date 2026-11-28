-- CreateEnum
CREATE TYPE "ActionKind" AS ENUM ('TASK', 'CORRECTION', 'CORRECTIVE', 'IMPROVEMENT');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('NONCONFORMITY', 'COMPLAINT', 'ACCIDENT', 'NEAR_MISS', 'UNSAFE_SITUATION', 'ENVIRONMENTAL_INCIDENT', 'DAMAGE', 'IMPROVEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportOrigin" AS ENUM ('INTERNAL', 'CUSTOMER', 'SUPPLIER', 'EXTERNAL_AUDIT', 'AUTHORITY', 'NEIGHBOUR', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'SEVERE');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'CLOSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InjuryLevel" AS ENUM ('NONE', 'FIRST_AID', 'MEDICAL', 'LOST_TIME', 'PERMANENT', 'FATAL');

-- AlterEnum
ALTER TYPE "ActionSource" ADD VALUE 'INCIDENT';

-- AlterTable
ALTER TABLE "Action" ADD COLUMN     "externalRef" TEXT,
ADD COLUMN     "kind" "ActionKind" NOT NULL DEFAULT 'TASK',
ADD COLUMN     "ownerText" TEXT,
ADD COLUMN     "reportId" TEXT,
ADD COLUMN     "verificationNote" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "externalRef" TEXT,
    "type" "ReportType" NOT NULL,
    "origin" "ReportOrigin" NOT NULL DEFAULT 'INTERNAL',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "reporterText" TEXT,
    "reportedById" TEXT,
    "locationId" TEXT,
    "locationText" TEXT,
    "disciplineId" TEXT,
    "processId" TEXT,
    "severity" "ReportSeverity",
    "immediateAction" TEXT,
    "injury" "InjuryLevel",
    "lostDays" INTEGER,
    "reportable" BOOLEAN NOT NULL DEFAULT false,
    "reportedToAuthorityAt" TIMESTAMP(3),
    "rootCause" TEXT,
    "rootCauseMethod" TEXT,
    "causeCategory" TEXT,
    "costs" DECIMAL(12,2),
    "ownerId" TEXT,
    "ownerText" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'NEW',
    "effective" BOOLEAN,
    "effectivenessNote" TEXT,
    "effectivenessCheckedAt" TIMESTAMP(3),
    "closingNote" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ReportRequirements" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ReportRequirements_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Report_number_key" ON "Report"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Report_externalRef_key" ON "Report"("externalRef");

-- CreateIndex
CREATE INDEX "Report_type_status_idx" ON "Report"("type", "status");

-- CreateIndex
CREATE INDEX "Report_occurredAt_idx" ON "Report"("occurredAt");

-- CreateIndex
CREATE INDEX "_ReportRequirements_B_index" ON "_ReportRequirements"("B");

-- CreateIndex
CREATE UNIQUE INDEX "Action_externalRef_key" ON "Action"("externalRef");

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ReportRequirements" ADD CONSTRAINT "_ReportRequirements_A_fkey" FOREIGN KEY ("A") REFERENCES "NormRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ReportRequirements" ADD CONSTRAINT "_ReportRequirements_B_fkey" FOREIGN KEY ("B") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

