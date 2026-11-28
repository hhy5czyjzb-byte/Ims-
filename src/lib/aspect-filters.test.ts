import { test } from "node:test";
import assert from "node:assert/strict";
import { aspectMatches, aspectWhere } from "./aspect-filters";

test("aspectWhere: standaard actief, onbekende waarden genegeerd, filters gecombineerd", () => {
  assert.deepEqual(aspectWhere({}, "u1"), { AND: [{ active: true }] });
  assert.deepEqual(aspectWhere({ type: "x", prio: "y", significant: "z", actief: "alle" }, "u1"), {});
  assert.deepEqual(aspectWhere({ bu: "Beton", prio: "HIGH", werking: "ja", soort: "kans", eigenaar: "mij", co2: "ja" }, "u1").AND, [
    { active: true },
    { businessUnit: "Beton" },
    { inOperation: true },
    { priority: "HIGH" },
    { opportunity: true },
    { ownerId: "u1" },
    { co2Relevant: true },
  ]);
  assert.deepEqual(aspectWhere({ prio: "geen", actief: "alle" }, "u1").AND, [{ priority: null }]);
});

test("aspectMatches: risiconiveau en signaal", () => {
  const a = { effectScore: 3, exposure: 7, probability: 3, priority: "LOW" as const, opportunity: false }; // 63 middel
  assert.equal(aspectMatches({}, a), true);
  assert.equal(aspectMatches({ niveau: "medium" }, a), true);
  assert.equal(aspectMatches({ niveau: "low" }, a), false);
  assert.equal(aspectMatches({ niveau: "hoog+" }, a), false);
  assert.equal(aspectMatches({ signaal: "ja" }, a), true);
  assert.equal(aspectMatches({ signaal: "lower" }, a), true);
  assert.equal(aspectMatches({ signaal: "higher" }, a), false);
  assert.equal(aspectMatches({ niveau: "geen" }, { ...a, probability: null }), true);
});
