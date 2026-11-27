import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeFootprint,
  factorAt,
  groupKg,
  overlapFraction,
  parseDecimal,
  parsePeriod,
  periodRange,
  targetProgress,
  type ConsumptionInput,
  type FactorRow,
} from "./co2";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

test("periodRange", () => {
  assert.deepEqual(periodRange(2026, "H2"), { start: d("2026-07-01"), end: d("2027-01-01"), label: "2e halfjaar 2026" });
  assert.equal(periodRange(2026).end.toISOString().slice(0, 10), "2027-01-01");
  assert.equal(periodRange(2026, "Q2").start.toISOString().slice(0, 10), "2026-04-01");
});

test("overlapFraction: naar rato van de dagen", () => {
  // 15 dec t/m 14 jan = 31 dagen; 17 in december
  assert.equal(overlapFraction(d("2025-12-15"), d("2026-01-14"), d("2026-01-01"), d("2027-01-01")).toFixed(4), (14 / 31).toFixed(4));
  assert.equal(overlapFraction(d("2026-03-01"), d("2026-03-31"), d("2026-01-01"), d("2026-07-01")), 1);
  assert.equal(overlapFraction(d("2026-08-01"), d("2026-08-31"), d("2026-01-01"), d("2026-07-01")), 0);
});

test("factorAt: meest recente factor op of vóór de datum", () => {
  const f: FactorRow[] = [
    { carrierId: "diesel", factor: 3.0, validFrom: d("2025-01-01") },
    { carrierId: "diesel", factor: 3.2, validFrom: d("2026-01-01") },
    { carrierId: "gas", factor: 2.0, validFrom: d("2025-01-01") },
  ];
  assert.equal(factorAt(f, "diesel", d("2025-06-01"))?.factor, 3.0);
  assert.equal(factorAt(f, "diesel", d("2026-01-01"))?.factor, 3.2);
  assert.equal(factorAt(f, "diesel", d("2024-12-31")), null);
  assert.equal(factorAt(f, "stroom", d("2026-01-01")), null);
});

test("computeFootprint: scopes, afwijkende scope, ontbrekende factor en toerekening", () => {
  const factors: FactorRow[] = [
    { carrierId: "diesel", factor: 3, validFrom: d("2020-01-01") },
    { carrierId: "stroom", factor: 0.5, validFrom: d("2020-01-01") },
  ];
  const c: ConsumptionInput[] = [
    { id: "a", carrierId: "diesel", quantity: 1000, periodStart: d("2026-01-01"), periodEnd: d("2026-01-31"), scope: null, carrierScope: 1 },
    { id: "b", carrierId: "stroom", quantity: 2000, periodStart: d("2026-02-01"), periodEnd: d("2026-02-28"), scope: null, carrierScope: 2 },
    { id: "c", carrierId: "diesel", quantity: 100, periodStart: d("2026-03-01"), periodEnd: d("2026-03-31"), scope: 3, carrierScope: 1 },
    { id: "e", carrierId: "hvo", quantity: 50, periodStart: d("2026-03-01"), periodEnd: d("2026-03-31"), scope: null, carrierScope: 1 },
    { id: "f", carrierId: "diesel", quantity: 365, periodStart: d("2026-01-01"), periodEnd: d("2026-12-31"), scope: null, carrierScope: 1 },
  ];
  const r = computeFootprint(c, factors, periodRange(2026, "H1"));
  assert.equal(r.byScope[1].toFixed(2), (3000 + (181 / 365) * 365 * 3).toFixed(2)); // jan + H1-deel van jaarverbruik
  assert.equal(r.byScope[2], 1000);
  assert.equal(r.byScope[3], 300);
  assert.equal(r.missingFactor, 1);
  assert.equal(groupKg(r.rows, (x) => x.carrierId)[0].key, "diesel");
});

test("targetProgress: lineair pad", () => {
  const p = targetProgress({ baseKg: 1000, currentKg: 900, reductionPct: 20, baseYear: 2024, targetYear: 2028, year: 2026 });
  assert.equal(p.plannedPct, 10);
  assert.equal(Math.round(p.actualPct), 10);
  assert.equal(p.onTrack, true);
  assert.equal(targetProgress({ baseKg: 1000, currentKg: 950, reductionPct: 20, baseYear: 2024, targetYear: 2028, year: 2026 }).onTrack, false);
  assert.equal(targetProgress({ baseKg: 0, currentKg: 5, reductionPct: 20, baseYear: 2024, targetYear: 2028, year: 2026 }).onTrack, null);
});

test("parseDecimal: Nederlandse notatie", () => {
  assert.equal(parseDecimal("1.234,5").value, 1234.5);
  assert.equal(parseDecimal("12,5").value, 12.5);
  assert.equal(parseDecimal("1.234").value, 1234);
  assert.equal(parseDecimal("1,234.5").value, 1234.5);
  assert.equal(parseDecimal("0.75").value, 0.75);
  assert.equal(parseDecimal(42).value, 42);
  assert.equal(parseDecimal("-12,5").value, -12.5);
  assert.equal(parseDecimal("1 250").value, 1250);
  assert.deepEqual(parseDecimal("veel"), { value: null, invalid: true });
  assert.deepEqual(parseDecimal(""), { value: null, invalid: false });
});

test("parsePeriod", () => {
  assert.deepEqual(parsePeriod("2026-03"), { start: "2026-03-01", end: "2026-03-31" });
  assert.deepEqual(parsePeriod("02-2028"), { start: "2028-02-01", end: "2028-02-29" });
  assert.deepEqual(parsePeriod("maart 2026"), { start: "2026-03-01", end: "2026-03-31" });
  assert.deepEqual(parsePeriod("mrt-26"), { start: "2026-03-01", end: "2026-03-31" });
  assert.deepEqual(parsePeriod("Q2 2026"), { start: "2026-04-01", end: "2026-06-30" });
  assert.deepEqual(parsePeriod("2026-H2"), { start: "2026-07-01", end: "2026-12-31" });
  assert.deepEqual(parsePeriod("h1 2026"), { start: "2026-01-01", end: "2026-06-30" });
  assert.deepEqual(parsePeriod("2026"), { start: "2026-01-01", end: "2026-12-31" });
  assert.deepEqual(parsePeriod("15-01-2026"), { start: "2026-01-15", end: "2026-01-15" });
  assert.deepEqual(parsePeriod(d("2026-05-01")), { start: "2026-05-01", end: "2026-05-01" });
  assert.equal(parsePeriod("2026-13"), null);
  assert.equal(parsePeriod("Q5 2026"), null);
  assert.equal(parsePeriod("ergens"), null);
});

test("formatFactor, formatPct en unitMatches", async () => {
  const { formatFactor, formatPct, unitMatches } = await import("./co2");
  assert.equal(formatFactor(3.262), "3,262");
  assert.equal(formatPct(5.66), "5,7 %");
  assert.equal(formatPct(2, true), "+2,0 %");
  assert.equal(unitMatches("l", "liter"), true);
  assert.equal(unitMatches("Ltr.", "liter"), true);
  assert.equal(unitMatches("m³", "m3"), true);
  assert.equal(unitMatches("KWH", "kWh"), true);
  assert.equal(unitMatches("MWh", "kWh"), false);
  assert.equal(unitMatches("kg", "liter"), false);
});
