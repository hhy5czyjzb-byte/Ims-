-- CreateEnum
CREATE TYPE "AspectType" AS ENUM ('AIR', 'NOISE', 'SOIL', 'WATER', 'ENERGY', 'WASTE', 'RESOURCES', 'ODOUR', 'VIBRATION', 'LIGHT', 'TRANSPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "OperatingSituation" AS ENUM ('NORMAL', 'ABNORMAL', 'EMERGENCY');

-- AlterEnum
ALTER TYPE "ActionSource" ADD VALUE 'ENVIRONMENTAL_ASPECT';

-- AlterTable
ALTER TABLE "Action" ADD COLUMN     "environmentalAspectId" TEXT;

-- CreateTable
CREATE TABLE "EnvironmentalAspect" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "externalRef" TEXT,
    "activity" TEXT NOT NULL,
    "aspectType" "AspectType" NOT NULL DEFAULT 'OTHER',
    "aspect" TEXT NOT NULL,
    "impact" TEXT,
    "situation" "OperatingSituation" NOT NULL DEFAULT 'NORMAL',
    "controls" TEXT,
    "frequency" INTEGER,
    "severity" INTEGER,
    "extent" INTEGER,
    "score" INTEGER,
    "legalApplies" BOOLEAN NOT NULL DEFAULT false,
    "stakeholderConcern" BOOLEAN NOT NULL DEFAULT false,
    "co2Relevant" BOOLEAN NOT NULL DEFAULT false,
    "significant" BOOLEAN NOT NULL DEFAULT false,
    "significanceManual" BOOLEAN NOT NULL DEFAULT false,
    "significanceReason" TEXT,
    "reviewDate" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "ownerId" TEXT,
    "createdById" TEXT,
    "disciplineId" TEXT,
    "locationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnvironmentalAspect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "_AspectProcesses" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AspectProcesses_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_AspectRisks" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AspectRisks_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_AspectLegal" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AspectLegal_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_AspectNormRequirements" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AspectNormRequirements_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "EnvironmentalAspect_number_key" ON "EnvironmentalAspect"("number");

-- CreateIndex
CREATE UNIQUE INDEX "EnvironmentalAspect_externalRef_key" ON "EnvironmentalAspect"("externalRef");

-- CreateIndex
CREATE INDEX "EnvironmentalAspect_significant_idx" ON "EnvironmentalAspect"("significant");

-- CreateIndex
CREATE INDEX "_AspectProcesses_B_index" ON "_AspectProcesses"("B");

-- CreateIndex
CREATE INDEX "_AspectRisks_B_index" ON "_AspectRisks"("B");

-- CreateIndex
CREATE INDEX "_AspectLegal_B_index" ON "_AspectLegal"("B");

-- CreateIndex
CREATE INDEX "_AspectNormRequirements_B_index" ON "_AspectNormRequirements"("B");

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_environmentalAspectId_fkey" FOREIGN KEY ("environmentalAspectId") REFERENCES "EnvironmentalAspect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvironmentalAspect" ADD CONSTRAINT "EnvironmentalAspect_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvironmentalAspect" ADD CONSTRAINT "EnvironmentalAspect_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvironmentalAspect" ADD CONSTRAINT "EnvironmentalAspect_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvironmentalAspect" ADD CONSTRAINT "EnvironmentalAspect_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSetting" ADD CONSTRAINT "AppSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AspectProcesses" ADD CONSTRAINT "_AspectProcesses_A_fkey" FOREIGN KEY ("A") REFERENCES "EnvironmentalAspect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AspectProcesses" ADD CONSTRAINT "_AspectProcesses_B_fkey" FOREIGN KEY ("B") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AspectRisks" ADD CONSTRAINT "_AspectRisks_A_fkey" FOREIGN KEY ("A") REFERENCES "EnvironmentalAspect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AspectRisks" ADD CONSTRAINT "_AspectRisks_B_fkey" FOREIGN KEY ("B") REFERENCES "Risk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AspectLegal" ADD CONSTRAINT "_AspectLegal_A_fkey" FOREIGN KEY ("A") REFERENCES "EnvironmentalAspect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AspectLegal" ADD CONSTRAINT "_AspectLegal_B_fkey" FOREIGN KEY ("B") REFERENCES "LegalRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AspectNormRequirements" ADD CONSTRAINT "_AspectNormRequirements_A_fkey" FOREIGN KEY ("A") REFERENCES "EnvironmentalAspect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AspectNormRequirements" ADD CONSTRAINT "_AspectNormRequirements_B_fkey" FOREIGN KEY ("B") REFERENCES "NormRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

