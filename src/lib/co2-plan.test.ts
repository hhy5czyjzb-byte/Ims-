import { test } from "node:test";
import assert from "node:assert/strict";
import { milestonePct, planCalculation } from "@/lib/co2-plan";

// Cijfers zoals in 'PVA - berekening doelstelling' van Rouwmaat (basisjaar 2025, tCO2 en GJ).
const groups = [
  { group: "Scope 1 - Aardgasverbruik", kg: 84_726, gj: 1507 },
  { group: "Scope 1 - Brandstofverbruik", kg: 8_263_957, gj: 91_744 },
  { group: "Scope 2 - Elektriciteitsverbruik", kg: 435_270, gj: 7_793.5 },
];
const totalKg = 8_869_829;
const totalGj = 101_950.7;

test("planCalculation: reductie op totaal per maatregel, stroom en scope zoals in het dashboard", () => {
  const r = planCalculation({
    groups,
    totalKg,
    totalGj,
    measures: [
      { id: "shovel", group: "Scope 1 - Brandstofverbruik", reductionPct: 1.8, energyReductionPct: 1.19 },
      { id: "kraakpers", group: "Scope 1 - Brandstofverbruik", reductionPct: 12, energyReductionPct: 7.91 },
      { id: "rest", group: "Scope 1 - Brandstofverbruik", reductionPct: 5.1, energyReductionPct: 5.03 },
      { id: "groen", group: "Scope 2 - Elektriciteitsverbruik", reductionPct: 77.2, energyReductionPct: 0 },
      { id: "led", group: "Scope 2 - Elektriciteitsverbruik", reductionPct: 0.09, energyReductionPct: 0.09 },
      { id: "laden", group: "Scope 2 - Elektriciteitsverbruik", reductionPct: 0, energyReductionPct: -57.3 },
      { id: "vervallen", group: "Scope 1 - Brandstofverbruik", reductionPct: 50, energyReductionPct: 0, cancelled: true },
    ],
  });
  const m = (id: string) => r.measures.find((x) => x.id === id)!;
  assert.equal(m("shovel").totalPct.toFixed(2), "1.68"); // dashboard: 1,68 %
  assert.equal(m("kraakpers").totalPct.toFixed(2), "11.18"); // dashboard: 11,18 %
  assert.equal(r.measures.length, 6, "vervallen maatregel telt niet mee");
  const s1 = r.scopes.find((s) => s.scope === 1)!;
  const s2 = r.scopes.find((s) => s.scope === 2)!;
  assert.equal(s1.totalPct.toFixed(1), "17.6"); // dashboard: 17,61 %
  assert.equal(s1.potentialPct.toFixed(1), "18.7"); // dashboard: 18,71 %
  assert.equal(s2.totalPct.toFixed(2), "3.79"); // dashboard: 3,79 %
  assert.equal(s2.potentialPct.toFixed(1), "77.3"); // dashboard: 77,29 %
  assert.equal(r.totalPct.toFixed(1), "21.4"); // dashboard: 21,40 %
  assert.ok(s2.energyTotalPct < 0, "elektrificatie verhoogt het energieverbruik in scope 2");
});

test("milestonePct: lineair pad, begrensd", () => {
  assert.equal(milestonePct(21, 2025, 2028, 2025), 0);
  assert.equal(milestonePct(21, 2025, 2028, 2026), 7);
  assert.equal(milestonePct(21, 2025, 2028, 2030), 21);
});
