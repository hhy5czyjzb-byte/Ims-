-- AlterTable
ALTER TABLE "EmissionFactor" ADD COLUMN     "biogenic" DECIMAL(14,6),
ADD COLUMN     "ttw" DECIMAL(14,6),
ADD COLUMN     "wtt" DECIMAL(14,6),
ALTER COLUMN "factor" SET DATA TYPE DECIMAL(14,6);

-- AlterTable
ALTER TABLE "EnergyCarrier" ADD COLUMN     "energyPerUnit" DECIMAL(14,8),
ADD COLUMN     "reportGroup" TEXT;

-- AlterTable
ALTER TABLE "EnergyConsumption" ADD COLUMN     "locationText" TEXT,
ADD COLUMN     "organisationId" TEXT,
ADD COLUMN     "sourceRef" TEXT;

-- CreateTable
CREATE TABLE "Co2Organisation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "boundaryPct" DECIMAL(6,2) NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Co2Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Co2Kpi" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT,
    "value" DECIMAL(18,4) NOT NULL,
    "organisationId" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Co2Kpi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataQualityItem" (
    "id" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "stream" TEXT NOT NULL,
    "carrierId" TEXT,
    "unit" TEXT,
    "source" TEXT,
    "dataOwner" TEXT,
    "executor" TEXT,
    "requestPeriod" TEXT,
    "analysisPeriod" TEXT,
    "deviation" TEXT,
    "uncertainty" TEXT,
    "improvement" TEXT,
    "qualityScore" INTEGER,
    "lastCheckedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataQualityItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionCo2" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "streamGroup" TEXT,
    "carrierId" TEXT,
    "reductionPct" DECIMAL(8,4),
    "energyReductionPct" DECIMAL(8,4),
    "measureType" TEXT,
    "skao" TEXT,
    "skaoCategory" TEXT,
    "term" TEXT,
    "planning" TEXT,
    "knowledgeNeed" TEXT,
    "progressNote" TEXT,
    "trl" TEXT,
    "flexibilityImpact" TEXT,
    "investment" TEXT,
    "legislation" TEXT,
    "resources" TEXT,
    "valueChain" TEXT,
    "currentYearActions" TEXT,
    "tenderAdvantage" TEXT,
    "notApplicableReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionCo2_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Co2Organisation_name_key" ON "Co2Organisation"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Co2Kpi_year_kind_organisationId_key" ON "Co2Kpi"("year", "kind", "organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "DataQualityItem_section_stream_key" ON "DataQualityItem"("section", "stream");

-- CreateIndex
CREATE UNIQUE INDEX "ActionCo2_actionId_key" ON "ActionCo2"("actionId");

-- AddForeignKey
ALTER TABLE "Co2Kpi" ADD CONSTRAINT "Co2Kpi_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Co2Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataQualityItem" ADD CONSTRAINT "DataQualityItem_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "EnergyCarrier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionCo2" ADD CONSTRAINT "ActionCo2_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionCo2" ADD CONSTRAINT "ActionCo2_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "EnergyCarrier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnergyConsumption" ADD CONSTRAINT "EnergyConsumption_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Co2Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

