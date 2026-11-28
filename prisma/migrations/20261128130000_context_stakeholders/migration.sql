-- CreateEnum
CREATE TYPE "ObligationCharacter" AS ENUM ('LEGAL', 'CONTRACTUAL', 'VOLUNTARY');

-- CreateEnum
CREATE TYPE "ContextFactorKind" AS ENUM ('EXTERNAL', 'INTERNAL');

-- CreateEnum
CREATE TYPE "ContextAnalysisStatus" AS ENUM ('CONCEPT', 'APPROVED', 'SUPERSEDED');

-- AlterTable
ALTER TABLE "Stakeholder" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "influenceLevel" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "type" SET DEFAULT 'EXTERNAL';

-- CreateTable
CREATE TABLE "StakeholderObligation" (
    "id" TEXT NOT NULL,
    "stakeholderText" TEXT NOT NULL,
    "obligation" TEXT NOT NULL,
    "character" "ObligationCharacter" NOT NULL DEFAULT 'LEGAL',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StakeholderObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContextFactor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ContextFactorKind" NOT NULL DEFAULT 'EXTERNAL',
    "importance" TEXT,
    "character" TEXT,
    "ambition" TEXT,
    "sectionNumber" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContextFactor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContextAnalysis" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "versionLabel" TEXT,
    "fileName" TEXT NOT NULL,
    "sharepointUrl" TEXT,
    "status" "ContextAnalysisStatus" NOT NULL DEFAULT 'CONCEPT',
    "ownerText" TEXT,
    "reviewCycle" TEXT,
    "approvedByText" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "nextReviewDate" TIMESTAMP(3),
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContextAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContextSection" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "part" INTEGER NOT NULL,
    "partTitle" TEXT,
    "partSubtitle" TEXT,
    "partKern" TEXT,
    "number" TEXT,
    "title" TEXT NOT NULL,
    "anchor" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "ContextSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContextImage" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "alt" TEXT,

    CONSTRAINT "ContextImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ObligationStakeholders" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ObligationStakeholders_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ObligationLegal" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ObligationLegal_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "StakeholderObligation_stakeholderText_obligation_key" ON "StakeholderObligation"("stakeholderText", "obligation");

-- CreateIndex
CREATE UNIQUE INDEX "ContextFactor_name_key" ON "ContextFactor"("name");

-- CreateIndex
CREATE INDEX "ContextSection_analysisId_sortOrder_idx" ON "ContextSection"("analysisId", "sortOrder");

-- CreateIndex
CREATE INDEX "ContextImage_analysisId_idx" ON "ContextImage"("analysisId");

-- CreateIndex
CREATE INDEX "_ObligationStakeholders_B_index" ON "_ObligationStakeholders"("B");

-- CreateIndex
CREATE INDEX "_ObligationLegal_B_index" ON "_ObligationLegal"("B");

-- CreateIndex
CREATE UNIQUE INDEX "Stakeholder_name_key" ON "Stakeholder"("name");

-- AddForeignKey
ALTER TABLE "ContextAnalysis" ADD CONSTRAINT "ContextAnalysis_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContextAnalysis" ADD CONSTRAINT "ContextAnalysis_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContextSection" ADD CONSTRAINT "ContextSection_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "ContextAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContextImage" ADD CONSTRAINT "ContextImage_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "ContextAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ObligationStakeholders" ADD CONSTRAINT "_ObligationStakeholders_A_fkey" FOREIGN KEY ("A") REFERENCES "Stakeholder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ObligationStakeholders" ADD CONSTRAINT "_ObligationStakeholders_B_fkey" FOREIGN KEY ("B") REFERENCES "StakeholderObligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ObligationLegal" ADD CONSTRAINT "_ObligationLegal_A_fkey" FOREIGN KEY ("A") REFERENCES "LegalRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ObligationLegal" ADD CONSTRAINT "_ObligationLegal_B_fkey" FOREIGN KEY ("B") REFERENCES "StakeholderObligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

