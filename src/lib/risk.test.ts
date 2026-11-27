import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVEL_RANGE, residual, riskCode, riskColor, riskLevel, riskScore } from "./risk";
import { brand } from "../theme/brand";

test("risicoscore en klasse", () => {
  assert.equal(riskScore(5, 5), 25);
  assert.equal(riskLevel(riskScore(1, 4)), "low");
  assert.equal(riskLevel(5), "medium");
  assert.equal(riskLevel(12), "high");
  assert.equal(riskLevel(15), "veryHigh");
});

test("klassengrenzen sluiten aan op riskLevel", () => {
  for (let s = 1; s <= 25; s++) {
    const [lo, hi] = LEVEL_RANGE[riskLevel(s)];
    assert.ok(s >= lo && s <= hi, `score ${s}`);
  }
});

test("kansen krijgen een groene schaal, risico's rood", () => {
  assert.equal(riskColor(25, "RISK"), brand.riskColors.veryHigh);
  assert.equal(riskColor(25, "OPPORTUNITY"), brand.opportunityColors.veryHigh);
});

test("restrisico valt terug op bruto score als 'na maatregelen' ontbreekt", () => {
  assert.deepEqual(residual({ likelihoodBefore: 4, impactBefore: 5, likelihoodAfter: null, impactAfter: null }), {
    likelihood: 4,
    impact: 5,
    score: 20,
    assessed: false,
  });
  assert.equal(residual({ likelihoodBefore: 4, impactBefore: 5, likelihoodAfter: 2, impactAfter: 3 }).score, 6);
});

test("risicocode", () => {
  assert.equal(riskCode(7, "RISK"), "R-007");
  assert.equal(riskCode(1234, "OPPORTUNITY"), "K-1234");
});
