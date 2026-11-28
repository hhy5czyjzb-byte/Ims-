import { test } from "node:test";
import assert from "node:assert/strict";
import { breakdown, countAspects, type StatAspect } from "./aspect-stats";

const base: StatAspect = {
  businessUnit: "Beton",
  locationText: "Groenlo",
  contextFactor: "Wet- en regelgeving",
  theme: "Geluid",
  siteType: "SITE",
  inOperation: true,
  priority: "LOW",
  significant: false,
  opportunity: false,
  origin: "MAR 2025",
  lifecycleSource: "MAR 2025",
  effectScore: 3,
  exposure: 6,
  probability: 0.5,
};

test("tellingen alleen voor locaties in werking", () => {
  const c = countAspects([
    base, // 9 laag
    { ...base, priority: "MEDIUM", significant: true, effectScore: 3, exposure: 7, probability: 3 }, // 63 middel, sig
    { ...base, priority: "HIGH", significant: true, opportunity: true, effectScore: 15, exposure: 6, probability: 1 }, // 90 hoog, kans
    { ...base, priority: "LOW", effectScore: 3, exposure: 7, probability: 3, origin: "Aanvulling 2026", lifecycleSource: "Concept 2026" }, // signaal lager
    { ...base, priority: null, probability: null, siteType: "PROJECT" },
    { ...base, inOperation: false, priority: "HIGH" },
  ]);
  assert.equal(c.total, 5);
  assert.deepEqual([c.high, c.medium, c.low, c.noPrio], [1, 1, 2, 1]);
  assert.equal(c.significant, 2);
  assert.equal(c.significantOpportunities, 1);
  assert.deepEqual([c.riskHigh, c.riskMedium, c.riskLow, c.notScored], [1, 2, 1, 1]);
  assert.equal(c.opportunities, 1);
  assert.equal(c.projects, 1);
  assert.equal(c.signalLower, 1);
  assert.equal(c.signalHigher, 0);
  assert.equal(c.lifecycleConcept, 1);
  assert.equal(c.addition, 1);
});

test("uitsplitsing per bedrijfsonderdeel", () => {
  const rows = breakdown([base, base, { ...base, businessUnit: "Infra" }, { ...base, businessUnit: null }], "bu");
  assert.deepEqual(
    rows.map((r) => [r.value, r.counts.total]),
    [
      ["Beton", 2],
      ["(leeg)", 1],
      ["Infra", 1],
    ],
  );
});
