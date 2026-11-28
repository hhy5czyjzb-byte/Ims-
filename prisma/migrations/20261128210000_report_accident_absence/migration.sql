-- CreateEnum
CREATE TYPE "AbsenceClass" AS ENUM ('SHORT', 'LONG');

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "absence" "AbsenceClass",
ADD COLUMN     "accidentCategory" TEXT;


-- Bestaande meldingen: verzuimklasse afleiden uit de verzuimdagen.
UPDATE "Report" SET "absence" = 'SHORT' WHERE "absence" IS NULL AND "lostDays" BETWEEN 1 AND 15;
UPDATE "Report" SET "absence" = 'LONG' WHERE "absence" IS NULL AND "lostDays" > 15;
