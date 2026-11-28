import { test } from "node:test";
import assert from "node:assert/strict";
import { inventoryChecks, type CheckLine } from "@/lib/co2-checks";
import { computeFootprint, monthsCovered } from "@/lib/co2";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const line = (o: Partial<CheckLine>): CheckLine => ({
  carrierId: "diesel",
  name: "Diesel",
  unit: "liter",
  scope: 1,
  quantity: 1000,
  kg: 3000,
  missing: 0,
  factorYear: 2025,
  coveredMonths: 12,
  ...o,
});

test("monthsCovered: binnen de periode, ook over de jaargrens", () => {
  assert.equal(monthsCovered(d("2025-01-01"), d("2025-12-31"), d("2025-01-01"), d("2026-01-01")).length, 12);
  assert.equal(monthsCovered(d("2024-12-01"), d("2025-01-31"), d("2025-01-01"), d("2026-01-01")).length, 1);
  assert.equal(monthsCovered(d("2025-03-15"), d("2025-03-20"), d("2025-01-01"), d("2026-01-01")).length, 1);
  assert.equal(monthsCovered(d("2024-01-01"), d("2024-12-31"), d("2025-01-01"), d("2026-01-01")).length, 0);
});

test("factor op het begin van het deel binnen de periode (verbruik over de jaargrens)", () => {
  const factors = [
    { carrierId: "diesel", factor: 3, validFrom: d("2024-01-01") },
    { carrierId: "diesel", factor: 4, validFrom: d("2025-01-01") },
  ];
  const c = [{ id: "a", carrierId: "diesel", quantity: 62, periodStart: d("2024-12-01"), periodEnd: d("2025-01-31"), scope: null, carrierScope: 1 }];
  const r = computeFootprint(c, factors, { start: d("2025-01-01"), end: d("2026-01-01") });
  assert.equal(r.totalKg, 31 * 4); // januari-deel met de factor van 2025
});

test("inventoryChecks: factoren, volledigheid, verschillen en ontbrekende stromen", () => {
  const checks = inventoryChecks({
    year: 2025,
    months: 12,
    lines: [
      line({ quantity: 1500, kg: 45000 }),
      line({ carrierId: "gas", name: "Aardgas", unit: "m3", missing: 2, kg: 0 }),
      line({ carrierId: "hvo", name: "HVO", factorYear: 2024, coveredMonths: 6, kg: 500, quantity: 200 }),
    ],
    previous: [line({ kg: 30000 }), line({ carrierId: "benz", name: "Benzine", kg: 6000 }), line({ carrierId: "hvo", name: "HVO", kg: 400, quantity: 100 })],
    fte: null,
    locationBasedConfigured: true,
  });
  const texts = checks.map((c) => `${c.level}:${c.text}`);
  assert.equal(checks[0].level, "error");
  assert.ok(texts.some((t) => t.startsWith("error:Aardgas")));
  assert.ok(texts.some((t) => t.startsWith("warning:HVO: emissiefactor van 2024")));
  assert.ok(texts.some((t) => t.startsWith("warning:HVO: verbruik in 6 van de 12")));
  assert.ok(texts.some((t) => t.startsWith("info:Diesel: +50 %")));
  assert.ok(!texts.some((t) => t.startsWith("info:HVO: +")), "kleine stroom: geen toelichting nodig");
  assert.ok(texts.some((t) => t.startsWith("warning:Benzine: geen verbruik")));
  assert.ok(texts.some((t) => t.includes("Geen FTE")));
});
