-- Plan van aanpak zoals in het CO2-dashboard: deadline als tekst, indicatie en volgorde.
ALTER TABLE "ActionCo2" ADD COLUMN "deadlineText" TEXT, ADD COLUMN "indication" TEXT, ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
