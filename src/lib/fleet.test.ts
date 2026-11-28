import { test } from "node:test";
import assert from "node:assert/strict";
import { fleetMatrix } from "@/lib/fleet";

test("fleetMatrix: per brandstof en jaar, totaal en zero-emissie", () => {
  const rows = [
    { year: 2024, vehicleType: "TRUCK", fuelType: "DIESEL", count: 75 },
    { year: 2024, vehicleType: "TRUCK", fuelType: "ELECTRIC", count: 3 },
    { year: 2024, vehicleType: "TRUCK", fuelType: "HYBRID", count: 9 },
    { year: 2025, vehicleType: "TRUCK", fuelType: "DIESEL", count: 58 },
    { year: 2025, vehicleType: "TRUCK", fuelType: "ELECTRIC", count: 5 },
    { year: 2025, vehicleType: "VAN", fuelType: "DIESEL", count: 10 },
  ];
  const m = fleetMatrix(rows, "TRUCK");
  assert.deepEqual(m.years, [2024, 2025]);
  assert.deepEqual(
    m.fuels.map((f) => f.key),
    ["ELECTRIC", "HYBRID", "DIESEL"],
  );
  assert.equal(m.total(2024), 87);
  assert.equal(m.value("HYBRID", 2025), 0);
  assert.equal(m.zeroPct(2025).toFixed(1), "7.9");
  assert.equal(fleetMatrix(rows).total(2025), 73);
});
