-- AlterTable
ALTER TABLE "Discipline" ADD COLUMN     "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "description" TEXT,
ADD COLUMN     "managerText" TEXT;

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "kind" TEXT,
ADD COLUMN     "managerText" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "permitInfo" TEXT,
ADD COLUMN     "postalCode" TEXT;


-- Bekende andere schrijfwijzen uit de registers van Rouwmaat (MAR, risicoregister).
UPDATE "Discipline" SET "aliases" = ARRAY['Afval & Recycling', 'Afval en recycling', 'Transport', 'Afvalrecycling'] WHERE "name" = 'Afval/Transport' AND cardinality("aliases") = 0;
