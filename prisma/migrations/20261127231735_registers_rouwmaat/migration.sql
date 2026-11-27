-- Uitbreiding risico's (eigen registerkenmerken), wet- en regelgeving en locaties; risico's krijgen meerdere disciplines (BU's).

CREATE TYPE "TreatmentStatus" AS ENUM ('OPEN', 'PLANNED', 'IN_PROGRESS', 'ONGOING', 'DONE');

CREATE TYPE "Applicability" AS ENUM ('YES', 'CONDITIONAL', 'TO_DETERMINE', 'NO');

CREATE TYPE "ImplementationStatus" AS ENUM ('IMPLEMENTED', 'IN_PROGRESS', 'ACTION_NEEDED', 'NOT_APPLICABLE');

CREATE TYPE "ImpactLevel" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

ALTER TABLE "LegalRequirement" ADD COLUMN     "applicability" "Applicability" NOT NULL DEFAULT 'YES',
ADD COLUMN     "evidence" TEXT,
ADD COLUMN     "impact" "ImpactLevel",
ADD COLUMN     "implementationStatus" "ImplementationStatus",
ADD COLUMN     "nextStep" TEXT,
ADD COLUMN     "origin" TEXT,
ADD COLUMN     "ownerText" TEXT,
ADD COLUMN     "regulationType" TEXT,
ADD COLUMN     "theme" TEXT;

ALTER TABLE "Location" ADD COLUMN     "activities" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "energySavingObligation" TEXT;

CREATE TABLE "_RiskDisciplines" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_RiskDisciplines_AB_pkey" PRIMARY KEY ("A","B")
);

CREATE TABLE "_LegalNorms" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_LegalNorms_AB_pkey" PRIMARY KEY ("A","B")
);

CREATE INDEX "_RiskDisciplines_B_index" ON "_RiskDisciplines"("B");

CREATE INDEX "_LegalNorms_B_index" ON "_LegalNorms"("B");

ALTER TABLE "_RiskDisciplines" ADD CONSTRAINT "_RiskDisciplines_A_fkey" FOREIGN KEY ("A") REFERENCES "Discipline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_RiskDisciplines" ADD CONSTRAINT "_RiskDisciplines_B_fkey" FOREIGN KEY ("B") REFERENCES "Risk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_LegalNorms" ADD CONSTRAINT "_LegalNorms_A_fkey" FOREIGN KEY ("A") REFERENCES "LegalRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_LegalNorms" ADD CONSTRAINT "_LegalNorms_B_fkey" FOREIGN KEY ("B") REFERENCES "Norm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Risk" ADD COLUMN     "contextFactor" TEXT,
ADD COLUMN     "externalRef" TEXT,
ADD COLUMN     "framework" TEXT,
ADD COLUMN     "lastReviewedAt" TIMESTAMP(3),
ADD COLUMN     "monitoring" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "origin" TEXT,
ADD COLUMN     "ownerText" TEXT,
ADD COLUMN     "strategic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "term" TEXT,
ADD COLUMN     "theme" TEXT,
ADD COLUMN     "treatmentStatus" "TreatmentStatus" NOT NULL DEFAULT 'OPEN';

CREATE UNIQUE INDEX "Risk_externalRef_key" ON "Risk"("externalRef");

-- Bestaande koppeling risico → discipline overzetten naar de nieuwe koppeltabel (vóór het verwijderen van de kolom)
INSERT INTO "_RiskDisciplines" ("A", "B") SELECT "disciplineId", "id" FROM "Risk" WHERE "disciplineId" IS NOT NULL ON CONFLICT DO NOTHING;

ALTER TABLE "Risk" DROP CONSTRAINT "Risk_disciplineId_fkey";

ALTER TABLE "Risk" DROP COLUMN "disciplineId";

-- BU's volgens het eigen register van Rouwmaat: Afvalrecycling heet Afval/Transport; Asbestinventarisatie toegevoegd
UPDATE "Discipline" SET "name" = 'Afval/Transport', "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" = 'Afvalrecycling' AND NOT EXISTS (SELECT 1 FROM "Discipline" WHERE "name" = 'Afval/Transport');
INSERT INTO "Discipline" ("id", "name", "sortOrder", "active", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'Asbestinventarisatie', 50, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Discipline" WHERE "name" = 'Asbestinventarisatie');
