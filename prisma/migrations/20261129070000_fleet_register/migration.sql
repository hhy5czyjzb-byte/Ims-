-- Voertuigenregister: soort, brandstof, milieuklasse en in/uit dienst
ALTER TABLE "Equipment" ADD COLUMN "vehicleType" TEXT,
ADD COLUMN "fuelType" TEXT,
ADD COLUMN "euroClass" TEXT,
ADD COLUMN "brand" TEXT,
ADD COLUMN "model" TEXT,
ADD COLUMN "buildYear" INTEGER,
ADD COLUMN "inServiceFrom" TIMESTAMP(3),
ADD COLUMN "inServiceUntil" TIMESTAMP(3),
ADD COLUMN "notes" TEXT;

-- Wagenpark-aantallen: naast brandstoftype ook milieuclassificatie (bestaande regels = brandstof)
DROP INDEX "FleetCount_year_vehicleType_fuelType_key";
ALTER TABLE "FleetCount" RENAME COLUMN "fuelType" TO "value";
ALTER TABLE "FleetCount" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'FUEL';
CREATE UNIQUE INDEX "FleetCount_year_vehicleType_kind_value_key" ON "FleetCount"("year", "vehicleType", "kind", "value");
