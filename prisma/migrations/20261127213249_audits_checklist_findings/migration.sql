-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ChecklistResult" AS ENUM ('NOT_ASSESSED', 'CONFORM', 'FINDING', 'NOT_APPLICABLE');

-- AlterTable
ALTER TABLE "Audit" ADD COLUMN     "conclusion" TEXT,
ADD COLUMN     "number" SERIAL NOT NULL,
ADD COLUMN     "reportUrl" TEXT;

-- AlterTable
ALTER TABLE "AuditFinding" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "number" INTEGER,
ADD COLUMN     "rootCause" TEXT,
ADD COLUMN     "status" "FindingStatus" NOT NULL DEFAULT 'OPEN';

-- Bestaande bevindingen een volgnummer per audit geven, daarna verplicht maken
UPDATE "AuditFinding" f SET "number" = n.rn
FROM (SELECT "id", ROW_NUMBER() OVER (PARTITION BY "auditId" ORDER BY "createdAt", "id") AS rn FROM "AuditFinding") n
WHERE f."id" = n."id";
ALTER TABLE "AuditFinding" ALTER COLUMN "number" SET NOT NULL;

-- CreateTable
CREATE TABLE "AuditChecklistItem" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "result" "ChecklistResult" NOT NULL DEFAULT 'NOT_ASSESSED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditChecklistItem_requirementId_idx" ON "AuditChecklistItem"("requirementId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditChecklistItem_auditId_requirementId_key" ON "AuditChecklistItem"("auditId", "requirementId");

-- CreateIndex
CREATE UNIQUE INDEX "Audit_number_key" ON "Audit"("number");

-- CreateIndex
CREATE INDEX "Audit_plannedDate_idx" ON "Audit"("plannedDate");

-- CreateIndex
CREATE UNIQUE INDEX "AuditFinding_auditId_number_key" ON "AuditFinding"("auditId", "number");

-- AddForeignKey
ALTER TABLE "AuditChecklistItem" ADD CONSTRAINT "AuditChecklistItem_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditChecklistItem" ADD CONSTRAINT "AuditChecklistItem_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "NormRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

