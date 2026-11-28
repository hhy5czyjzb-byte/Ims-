-- CreateEnum
CREATE TYPE "AspectPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "AspectSiteType" AS ENUM ('SITE', 'PROJECT', 'GROUP');

-- AlterTable (eerst nieuwe kolommen, dan gegevens omzetten, dan oude kolommen weg)
ALTER TABLE "EnvironmentalAspect" ADD COLUMN     "businessUnit" TEXT,
ADD COLUMN     "complaints" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "contextFactor" TEXT,
ADD COLUMN     "effectScore" DECIMAL(6,2),
ADD COLUMN     "exposure" DECIMAL(6,2),
ADD COLUMN     "inOperation" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lcDesign" INTEGER,
ADD COLUMN     "lcDisposal" INTEGER,
ADD COLUMN     "lcEndOfLife" INTEGER,
ADD COLUMN     "lcProduction" INTEGER,
ADD COLUMN     "lcRawMaterials" INTEGER,
ADD COLUMN     "lcTransport" INTEGER,
ADD COLUMN     "lcUse" INTEGER,
ADD COLUMN     "legalText" TEXT,
ADD COLUMN     "lifecycleSource" TEXT,
ADD COLUMN     "locationText" TEXT,
ADD COLUMN     "mba" TEXT,
ADD COLUMN     "measure" TEXT,
ADD COLUMN     "opportunity" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "origin" TEXT,
ADD COLUMN     "ownerText" TEXT,
ADD COLUMN     "priority" "AspectPriority",
ADD COLUMN     "priorityRationale" TEXT,
ADD COLUMN     "probability" DECIMAL(6,2),
ADD COLUMN     "siteType" "AspectSiteType" NOT NULL DEFAULT 'SITE',
ADD COLUMN     "stakeholders" TEXT,
ADD COLUMN     "theme" TEXT;


-- Bestaande aspecten: significantie blijft behouden als prio (significant → middel, anders laag).
UPDATE "EnvironmentalAspect" SET "priority" = CASE WHEN "significant" THEN 'MEDIUM'::"AspectPriority" ELSE 'LOW'::"AspectPriority" END;
UPDATE "EnvironmentalAspect" SET "complaints" = "stakeholderConcern";

ALTER TABLE "EnvironmentalAspect" DROP COLUMN "extent",
DROP COLUMN "frequency",
DROP COLUMN "score",
DROP COLUMN "severity",
DROP COLUMN "significanceManual",
DROP COLUMN "significanceReason",
DROP COLUMN "stakeholderConcern";

-- De instelbare drempel (F × E × O) vervalt: significant = prio hoog of middel.
DELETE FROM "AppSetting" WHERE "key" = 'aspects.significanceThreshold';
