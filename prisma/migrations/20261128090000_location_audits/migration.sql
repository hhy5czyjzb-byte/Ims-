-- AlterEnum
ALTER TYPE "ActionSource" ADD VALUE 'LOCATION_AUDIT';

-- AlterTable
ALTER TABLE "Action" ADD COLUMN     "locationAuditAnswerId" TEXT;

-- CreateTable
CREATE TABLE "ComplianceQuestion" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "evidenceHint" TEXT,
    "theme" TEXT,
    "legalRequirementId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationAudit" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "locationId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "AuditStatus" NOT NULL DEFAULT 'PLANNED',
    "auditorId" TEXT,
    "auditorText" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationAuditAnswer" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "questionId" TEXT,
    "legalRequirementId" TEXT,
    "questionText" TEXT NOT NULL,
    "evidenceHint" TEXT,
    "theme" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "verdict" "ComplianceStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
    "finding" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationAuditAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComplianceQuestion_legalRequirementId_idx" ON "ComplianceQuestion"("legalRequirementId");

-- CreateIndex
CREATE UNIQUE INDEX "LocationAudit_number_key" ON "LocationAudit"("number");

-- CreateIndex
CREATE INDEX "LocationAudit_locationId_date_idx" ON "LocationAudit"("locationId", "date");

-- CreateIndex
CREATE INDEX "LocationAuditAnswer_legalRequirementId_idx" ON "LocationAuditAnswer"("legalRequirementId");

-- CreateIndex
CREATE UNIQUE INDEX "LocationAuditAnswer_auditId_questionId_key" ON "LocationAuditAnswer"("auditId", "questionId");

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_locationAuditAnswerId_fkey" FOREIGN KEY ("locationAuditAnswerId") REFERENCES "LocationAuditAnswer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceQuestion" ADD CONSTRAINT "ComplianceQuestion_legalRequirementId_fkey" FOREIGN KEY ("legalRequirementId") REFERENCES "LegalRequirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationAudit" ADD CONSTRAINT "LocationAudit_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationAudit" ADD CONSTRAINT "LocationAudit_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationAudit" ADD CONSTRAINT "LocationAudit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationAuditAnswer" ADD CONSTRAINT "LocationAuditAnswer_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "LocationAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationAuditAnswer" ADD CONSTRAINT "LocationAuditAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ComplianceQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationAuditAnswer" ADD CONSTRAINT "LocationAuditAnswer_legalRequirementId_fkey" FOREIGN KEY ("legalRequirementId") REFERENCES "LegalRequirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

