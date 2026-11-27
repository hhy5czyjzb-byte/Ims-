import { test } from "node:test";
import assert from "node:assert/strict";
import { riskLevel, riskScore } from "./risk";

test("risicoscore en klasse", () => {
  assert.equal(riskScore(5, 5), 25);
  assert.equal(riskLevel(riskScore(1, 4)), "low");
  assert.equal(riskLevel(5), "medium");
  assert.equal(riskLevel(12), "high");
  assert.equal(riskLevel(15), "veryHigh");
});
