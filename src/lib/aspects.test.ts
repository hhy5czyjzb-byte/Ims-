import { test } from "node:test";
import assert from "node:assert/strict";
import { aspectCode, aspectScore, defaultCo2Relevant, determineSignificance } from "./aspects";

test("aspectCode en score", () => {
  assert.equal(aspectCode(4), "MA-004");
  assert.equal(aspectScore(3, 4, 2), 24);
  assert.equal(aspectScore(3, null, 2), null);
  assert.equal(aspectScore(0, 4, 2), null);
});

test("significantie: drempel, wetgeving, belanghebbenden", () => {
  const base = { threshold: 27, legalApplies: false, stakeholderConcern: false };
  assert.deepEqual(determineSignificance({ ...base, score: 27 }), { significant: true, reasons: ["Score 27 ≥ drempel 27"] });
  assert.deepEqual(determineSignificance({ ...base, score: 26 }), { significant: false, reasons: [] });
  assert.equal(determineSignificance({ ...base, score: 4, legalApplies: true }).significant, true);
  assert.equal(determineSignificance({ ...base, score: null, stakeholderConcern: true }).significant, true);
  assert.deepEqual(determineSignificance({ ...base, score: null }), { significant: false, reasons: [] });
});

test("significantie: handmatige bepaling gaat voor", () => {
  const r = determineSignificance({
    score: 100,
    threshold: 27,
    legalApplies: true,
    stakeholderConcern: false,
    manual: { significant: false, reason: "Afgedekt door vergunning" },
  });
  assert.deepEqual(r, { significant: false, reasons: ["Handmatig bepaald: Afgedekt door vergunning"] });
});

test("CO2-relevantie standaard voor energie, lucht en transport", () => {
  assert.equal(defaultCo2Relevant("ENERGY"), true);
  assert.equal(defaultCo2Relevant("NOISE"), false);
});
