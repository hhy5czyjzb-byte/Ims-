-- CreateEnum
CREATE TYPE "Role" AS ENUM ('KAM', 'DIRECTIE', 'MIDDENKADER');

-- CreateEnum
CREATE TYPE "NormCategory" AS ENUM ('QUALITY', 'ENVIRONMENT', 'SAFETY', 'CO2', 'PRODUCT', 'OTHER');

-- CreateEnum
CREATE TYPE "RaciType" AS ENUM ('R', 'A', 'C', 'I');

-- CreateEnum
CREATE TYPE "RiskType" AS ENUM ('RISK', 'OPPORTUNITY');

-- CreateEnum
CREATE TYPE "RiskStatus" AS ENUM ('OPEN', 'CONTROLLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AuditType" AS ENUM ('INTERNAL', 'EXTERNAL', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FindingClass" AS ENUM ('MAJOR', 'MINOR', 'OBSERVATION');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ActionPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ActionSource" AS ENUM ('MANUAL', 'AUDIT', 'RISK', 'COMPLIANCE', 'NONCONFORMITY', 'MANAGEMENT_REVIEW', 'COMPLAINT', 'OTHER');

-- CreateEnum
CREATE TYPE "SupplierStatus" AS ENUM ('NEW', 'APPROVED', 'CONDITIONAL', 'REJECTED');

-- CreateEnum
CREATE TYPE "StakeholderType" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "entraObjectId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MIDDENKADER',
    "jobFunctionId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Discipline" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Discipline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobFunction" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobFunction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Norm" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT,
    "category" "NormCategory" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Norm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NormRequirement" (
    "id" TEXT NOT NULL,
    "normId" TEXT NOT NULL,
    "parentId" TEXT,
    "clause" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NormRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Process" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "purpose" TEXT,
    "input" TEXT,
    "output" TEXT,
    "disciplineId" TEXT,
    "ownerId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Process_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessStep" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaciAssignment" (
    "id" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "type" "RaciType" NOT NULL,
    "jobFunctionId" TEXT,
    "userId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaciAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "documentNumber" TEXT,
    "sharePointDriveId" TEXT,
    "sharePointItemId" TEXT,
    "webUrl" TEXT NOT NULL,
    "fileType" TEXT,
    "status" TEXT,
    "version" TEXT,
    "ownerName" TEXT,
    "ownerId" TEXT,
    "revisionDate" TIMESTAMP(3),
    "lastModifiedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "removedInSource" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Risk" (
    "id" TEXT NOT NULL,
    "type" "RiskType" NOT NULL DEFAULT 'RISK',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "cause" TEXT,
    "consequence" TEXT,
    "likelihoodBefore" INTEGER NOT NULL,
    "impactBefore" INTEGER NOT NULL,
    "measures" TEXT,
    "likelihoodAfter" INTEGER,
    "impactAfter" INTEGER,
    "status" "RiskStatus" NOT NULL DEFAULT 'OPEN',
    "ownerId" TEXT,
    "disciplineId" TEXT,
    "locationId" TEXT,
    "reviewDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Risk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audit" (
    "id" TEXT NOT NULL,
    "type" "AuditType" NOT NULL,
    "title" TEXT NOT NULL,
    "plannedDate" TIMESTAMP(3) NOT NULL,
    "completedDate" TIMESTAMP(3),
    "auditor" TEXT,
    "certificationBody" TEXT,
    "scope" TEXT,
    "status" "AuditStatus" NOT NULL DEFAULT 'PLANNED',
    "locationId" TEXT,
    "disciplineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditFinding" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "requirementId" TEXT,
    "classification" "FindingClass" NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Action" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "source" "ActionSource" NOT NULL DEFAULT 'MANUAL',
    "status" "ActionStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "ActionPriority" NOT NULL DEFAULT 'MEDIUM',
    "ownerId" TEXT,
    "createdById" TEXT,
    "deadline" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "result" TEXT,
    "disciplineId" TEXT,
    "locationId" TEXT,
    "riskId" TEXT,
    "findingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "status" "SupplierStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "disciplineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierEvaluation" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "quality" INTEGER NOT NULL,
    "delivery" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "safety" INTEGER NOT NULL,
    "environment" INTEGER,
    "remarks" TEXT,
    "nextEvaluationDate" TIMESTAMP(3),
    "evaluatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stakeholder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "StakeholderType" NOT NULL,
    "needs" TEXT,
    "expectations" TEXT,
    "influence" INTEGER,
    "interest" INTEGER,
    "howAddressed" TEXT,
    "ownerId" TEXT,
    "reviewDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stakeholder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "userEmail" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT,
    "details" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ProcessRequirements" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ProcessRequirements_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_StepRequirements" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_StepRequirements_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_RiskRequirements" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_RiskRequirements_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_RiskProcesses" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_RiskProcesses_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_DocumentRequirements" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_DocumentRequirements_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ProcessDocuments" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ProcessDocuments_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_StepDocuments" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_StepDocuments_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_AuditNorms" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AuditNorms_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ActionRequirements" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ActionRequirements_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_entraObjectId_key" ON "User"("entraObjectId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Location_name_key" ON "Location"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Discipline_name_key" ON "Discipline"("name");

-- CreateIndex
CREATE UNIQUE INDEX "JobFunction_name_key" ON "JobFunction"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Norm_code_key" ON "Norm"("code");

-- CreateIndex
CREATE INDEX "NormRequirement_normId_sortOrder_idx" ON "NormRequirement"("normId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "NormRequirement_normId_clause_key" ON "NormRequirement"("normId", "clause");

-- CreateIndex
CREATE UNIQUE INDEX "Process_code_key" ON "Process"("code");

-- CreateIndex
CREATE INDEX "ProcessStep_processId_sortOrder_idx" ON "ProcessStep"("processId", "sortOrder");

-- CreateIndex
CREATE INDEX "RaciAssignment_stepId_idx" ON "RaciAssignment"("stepId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_sharePointItemId_key" ON "Document"("sharePointItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Action_number_key" ON "Action"("number");

-- CreateIndex
CREATE INDEX "Action_status_deadline_idx" ON "Action"("status", "deadline");

-- CreateIndex
CREATE INDEX "Action_ownerId_idx" ON "Action"("ownerId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "_ProcessRequirements_B_index" ON "_ProcessRequirements"("B");

-- CreateIndex
CREATE INDEX "_StepRequirements_B_index" ON "_StepRequirements"("B");

-- CreateIndex
CREATE INDEX "_RiskRequirements_B_index" ON "_RiskRequirements"("B");

-- CreateIndex
CREATE INDEX "_RiskProcesses_B_index" ON "_RiskProcesses"("B");

-- CreateIndex
CREATE INDEX "_DocumentRequirements_B_index" ON "_DocumentRequirements"("B");

-- CreateIndex
CREATE INDEX "_ProcessDocuments_B_index" ON "_ProcessDocuments"("B");

-- CreateIndex
CREATE INDEX "_StepDocuments_B_index" ON "_StepDocuments"("B");

-- CreateIndex
CREATE INDEX "_AuditNorms_B_index" ON "_AuditNorms"("B");

-- CreateIndex
CREATE INDEX "_ActionRequirements_B_index" ON "_ActionRequirements"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_jobFunctionId_fkey" FOREIGN KEY ("jobFunctionId") REFERENCES "JobFunction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormRequirement" ADD CONSTRAINT "NormRequirement_normId_fkey" FOREIGN KEY ("normId") REFERENCES "Norm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormRequirement" ADD CONSTRAINT "NormRequirement_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "NormRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Process" ADD CONSTRAINT "Process_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Process" ADD CONSTRAINT "Process_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessStep" ADD CONSTRAINT "ProcessStep_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaciAssignment" ADD CONSTRAINT "RaciAssignment_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "ProcessStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaciAssignment" ADD CONSTRAINT "RaciAssignment_jobFunctionId_fkey" FOREIGN KEY ("jobFunctionId") REFERENCES "JobFunction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaciAssignment" ADD CONSTRAINT "RaciAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditFinding" ADD CONSTRAINT "AuditFinding_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditFinding" ADD CONSTRAINT "AuditFinding_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "NormRequirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "AuditFinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierEvaluation" ADD CONSTRAINT "SupplierEvaluation_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierEvaluation" ADD CONSTRAINT "SupplierEvaluation_evaluatedById_fkey" FOREIGN KEY ("evaluatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stakeholder" ADD CONSTRAINT "Stakeholder_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProcessRequirements" ADD CONSTRAINT "_ProcessRequirements_A_fkey" FOREIGN KEY ("A") REFERENCES "NormRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProcessRequirements" ADD CONSTRAINT "_ProcessRequirements_B_fkey" FOREIGN KEY ("B") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StepRequirements" ADD CONSTRAINT "_StepRequirements_A_fkey" FOREIGN KEY ("A") REFERENCES "NormRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StepRequirements" ADD CONSTRAINT "_StepRequirements_B_fkey" FOREIGN KEY ("B") REFERENCES "ProcessStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RiskRequirements" ADD CONSTRAINT "_RiskRequirements_A_fkey" FOREIGN KEY ("A") REFERENCES "NormRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RiskRequirements" ADD CONSTRAINT "_RiskRequirements_B_fkey" FOREIGN KEY ("B") REFERENCES "Risk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RiskProcesses" ADD CONSTRAINT "_RiskProcesses_A_fkey" FOREIGN KEY ("A") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RiskProcesses" ADD CONSTRAINT "_RiskProcesses_B_fkey" FOREIGN KEY ("B") REFERENCES "Risk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DocumentRequirements" ADD CONSTRAINT "_DocumentRequirements_A_fkey" FOREIGN KEY ("A") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DocumentRequirements" ADD CONSTRAINT "_DocumentRequirements_B_fkey" FOREIGN KEY ("B") REFERENCES "NormRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProcessDocuments" ADD CONSTRAINT "_ProcessDocuments_A_fkey" FOREIGN KEY ("A") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProcessDocuments" ADD CONSTRAINT "_ProcessDocuments_B_fkey" FOREIGN KEY ("B") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StepDocuments" ADD CONSTRAINT "_StepDocuments_A_fkey" FOREIGN KEY ("A") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StepDocuments" ADD CONSTRAINT "_StepDocuments_B_fkey" FOREIGN KEY ("B") REFERENCES "ProcessStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AuditNorms" ADD CONSTRAINT "_AuditNorms_A_fkey" FOREIGN KEY ("A") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AuditNorms" ADD CONSTRAINT "_AuditNorms_B_fkey" FOREIGN KEY ("B") REFERENCES "Norm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ActionRequirements" ADD CONSTRAINT "_ActionRequirements_A_fkey" FOREIGN KEY ("A") REFERENCES "Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ActionRequirements" ADD CONSTRAINT "_ActionRequirements_B_fkey" FOREIGN KEY ("B") REFERENCES "NormRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
