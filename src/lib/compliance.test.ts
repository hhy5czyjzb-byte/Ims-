import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, complianceSummary, legalCode, needsAction } from "./compliance";

test("legalCode", () => {
  assert.equal(legalCode(12), "W-012");
});

test("addMonths kapt af op einde maand", () => {
  assert.equal(addMonths(new Date("2026-01-31T00:00:00Z"), 1).toISOString().slice(0, 10), "2026-02-28");
  assert.equal(addMonths(new Date("2026-03-15T00:00:00Z"), 12).toISOString().slice(0, 10), "2027-03-15");
  assert.equal(addMonths(new Date("2027-11-30T00:00:00Z"), 3).toISOString().slice(0, 10), "2028-02-29");
});

test("complianceSummary: n.v.t. telt niet mee", () => {
  const s = complianceSummary(["COMPLIANT", "COMPLIANT", "PARTIAL", "NON_COMPLIANT", "NOT_APPLICABLE"]);
  assert.equal(s.relevant, 4);
  assert.equal(s.pct, 50);
  assert.equal(s.notApplicable, 1);
  assert.equal(complianceSummary([]).pct, 0);
});

test("needsAction", () => {
  assert.equal(needsAction("NON_COMPLIANT"), true);
  assert.equal(needsAction("PARTIAL"), true);
  assert.equal(needsAction("COMPLIANT"), false);
});
