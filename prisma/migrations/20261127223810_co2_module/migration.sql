-- CreateEnum
CREATE TYPE "EnergyCategory" AS ENUM ('FUEL', 'ELECTRICITY', 'GAS', 'HEAT', 'TRAVEL', 'TRANSPORT', 'OTHER');

-- AlterEnum
ALTER TYPE "ActionSource" ADD VALUE 'CO2_REDUCTION';

-- AlterTable
ALTER TABLE "Action" ADD COLUMN     "expectedReductionKg" DECIMAL(14,2),
ADD COLUMN     "reductionTargetId" TEXT;

-- CreateTable
CREATE TABLE "EnergyCarrier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT,
    "unit" TEXT NOT NULL,
    "category" "EnergyCategory" NOT NULL DEFAULT 'OTHER',
    "defaultScope" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnergyCarrier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmissionFactor" (
    "id" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "factor" DECIMAL(12,6) NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "source" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmissionFactor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "type" TEXT,
    "defaultCarrierId" TEXT,
    "disciplineId" TEXT,
    "locationId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnergyConsumption" (
    "id" TEXT NOT NULL,
    "externalRef" TEXT,
    "carrierId" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "scope" INTEGER,
    "description" TEXT,
    "disciplineId" TEXT,
    "locationId" TEXT,
    "equipmentId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnergyConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReductionTarget" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scope" INTEGER,
    "baseYear" INTEGER NOT NULL,
    "baselineKg" DECIMAL(16,2),
    "targetYear" INTEGER NOT NULL,
    "reductionPct" DECIMAL(6,2) NOT NULL,
    "disciplineId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReductionTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EnergyCarrier_name_key" ON "EnergyCarrier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "EmissionFactor_carrierId_validFrom_key" ON "EmissionFactor"("carrierId", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_code_key" ON "Equipment"("code");

-- CreateIndex
CREATE UNIQUE INDEX "EnergyConsumption_externalRef_key" ON "EnergyConsumption"("externalRef");

-- CreateIndex
CREATE INDEX "EnergyConsumption_periodStart_idx" ON "EnergyConsumption"("periodStart");

-- CreateIndex
CREATE INDEX "EnergyConsumption_carrierId_idx" ON "EnergyConsumption"("carrierId");

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_reductionTargetId_fkey" FOREIGN KEY ("reductionTargetId") REFERENCES "ReductionTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmissionFactor" ADD CONSTRAINT "EmissionFactor_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "EnergyCarrier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_defaultCarrierId_fkey" FOREIGN KEY ("defaultCarrierId") REFERENCES "EnergyCarrier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnergyConsumption" ADD CONSTRAINT "EnergyConsumption_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "EnergyCarrier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnergyConsumption" ADD CONSTRAINT "EnergyConsumption_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnergyConsumption" ADD CONSTRAINT "EnergyConsumption_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnergyConsumption" ADD CONSTRAINT "EnergyConsumption_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnergyConsumption" ADD CONSTRAINT "EnergyConsumption_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReductionTarget" ADD CONSTRAINT "ReductionTarget_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Extra databasecontroles (niet uitgedrukt in het Prisma-schema)
ALTER TABLE "EnergyCarrier" ADD CONSTRAINT "EnergyCarrier_defaultScope_check" CHECK ("defaultScope" BETWEEN 1 AND 3);
ALTER TABLE "EnergyConsumption" ADD CONSTRAINT "EnergyConsumption_scope_check" CHECK ("scope" IS NULL OR "scope" BETWEEN 1 AND 3);
ALTER TABLE "EnergyConsumption" ADD CONSTRAINT "EnergyConsumption_period_check" CHECK ("periodEnd" >= "periodStart");
ALTER TABLE "EmissionFactor" ADD CONSTRAINT "EmissionFactor_factor_check" CHECK ("factor" >= 0);
ALTER TABLE "ReductionTarget" ADD CONSTRAINT "ReductionTarget_scope_check" CHECK ("scope" IS NULL OR "scope" BETWEEN 1 AND 3);
ALTER TABLE "ReductionTarget" ADD CONSTRAINT "ReductionTarget_years_check" CHECK ("targetYear" > "baseYear");
