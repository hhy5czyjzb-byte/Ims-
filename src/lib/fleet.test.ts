import { test } from "node:test";
import assert from "node:assert/strict";
import { fleetSeries, inService, parseEuroClass, parseFuelType, parsePastedTable, parseVehicleType, referenceDate } from "@/lib/fleet";

test("herkennen: brandstof, Euroklasse en soort voertuig", () => {
  assert.equal(parseFuelType("Diesel"), "DIESEL");
  assert.equal(parseFuelType("Hybride (PHEV)"), "HYBRID");
  assert.equal(parseFuelType("Volledig elektrisch"), "ELECTRIC");
  assert.equal(parseFuelType("HVO100"), "HVO");
  assert.equal(parseEuroClass("Euro VI"), "EURO6");
  assert.equal(parseEuroClass("Euro 5"), "EURO5");
  assert.equal(parseEuroClass("4"), "EURO4");
  assert.equal(parseEuroClass("Elektrisch"), "ELECTRIC");
  assert.equal(parseEuroClass("Euro 6d"), "EURO6");
  assert.equal(parseEuroClass("onbekend"), null);
  assert.equal(parseVehicleType("Trekker"), "TRUCK");
  assert.equal(parseVehicleType("Bestelbus"), "VAN");
  assert.equal(parseVehicleType("Shovel"), "MACHINE");
});

test("plakken uit Excel: jaren in de kopregel of in de eerste kolom; totaal overgeslagen", () => {
  const t = parsePastedTable("Klasse\t2020\t2021\t2022\nElektrisch\t0\t0\t0\n6\t26\t36\t58\n5\t7\t6\t5\nTotaal\t33\t42\t63", "EURO");
  assert.deepEqual(t.years, [2020, 2021, 2022]);
  assert.deepEqual(
    t.rows.map((r) => [r.key, r.values]),
    [
      ["ELECTRIC", [0, 0, 0]],
      ["EURO6", [26, 36, 58]],
      ["EURO5", [7, 6, 5]],
    ],
  );
  const tr = parsePastedTable("Jaar;Diesel;Hybride\n2024;75;9\n2025;58;19", "FUEL");
  assert.deepEqual(tr.years, [2024, 2025]);
  assert.deepEqual(
    tr.rows.map((r) => [r.key, r.values]),
    [
      ["DIESEL", [75, 58]],
      ["HYBRID", [9, 19]],
    ],
  );
  assert.deepEqual(parsePastedTable("x\t2020\nOnzin\t3", "EURO").unknown, ["Onzin"]);
});

test("register: tellen op de peildatum; ingevoerde jaren gaan voor", () => {
  const now = new Date("2026-06-01");
  assert.equal(referenceDate(2024, now).toISOString().slice(0, 10), "2024-12-31");
  const v = (fuel: string, euro: string, from: string | null, until: string | null = null) => ({
    vehicleType: "TRUCK",
    fuelType: fuel,
    euroClass: euro,
    inServiceFrom: from ? new Date(from) : null,
    inServiceUntil: until ? new Date(until) : null,
    active: !until,
  });
  const vehicles = [v("DIESEL", "EURO5", "2018-01-01", "2024-06-30"), v("DIESEL", "EURO6", "2023-03-01"), v("ELECTRIC", "ELECTRIC", "2025-02-01")];
  assert.equal(inService(vehicles[0], new Date("2024-12-31"), now), false);
  const s = fleetSeries("EURO", [{ year: 2020, vehicleType: "TRUCK", kind: "EURO", value: "EURO4", count: 10 }], vehicles, "TRUCK", now);
  assert.equal(s.source(2020), "manual");
  assert.equal(s.value("EURO4", 2020), 10);
  assert.equal(s.source(2023), "register");
  assert.equal(s.total(2023), 2);
  assert.equal(s.value("EURO5", 2024), 0);
  assert.equal(s.total(2025), 2);
  assert.equal(s.zeroPct(2025), 50);
  assert.deepEqual(
    s.categories.map((c) => c.key),
    ["ELECTRIC", "EURO6", "EURO5", "EURO4"],
  );
});

test("alle voertuigen: per soort jaartabel óf register; lopend jaar alleen op verzoek", () => {
  const now = new Date("2026-06-01");
  const vehicles = [
    { vehicleType: "VAN", fuelType: "ELECTRIC", euroClass: "ELECTRIC", inServiceFrom: new Date("2024-01-01"), inServiceUntil: null, active: true },
    { vehicleType: "TRUCK", fuelType: "DIESEL", euroClass: "EURO6", inServiceFrom: new Date("2024-01-01"), inServiceUntil: null, active: true },
  ];
  const manual = [{ year: 2025, vehicleType: "TRUCK", kind: "EURO", value: "EURO6", count: 50 }];
  const s = fleetSeries("EURO", manual, vehicles, undefined, now);
  assert.deepEqual(s.years, [2024, 2025]);
  assert.equal(s.total(2025), 51); // 50 vrachtwagens uit de tabel + 1 bestelwagen uit het register
  assert.equal(s.source(2025), "mixed");
  assert.equal(s.source(2024), "register");
  assert.deepEqual(fleetSeries("EURO", manual, vehicles, undefined, now, true).years, [2024, 2025, 2026]);
});
