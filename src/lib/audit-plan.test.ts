import { test } from "node:test";
import assert from "node:assert/strict";
import { auditCode, cycleCell, cycleSummary, findingCode, type ChecklistHit } from "./audit-plan";

const hit = (status: ChecklistHit["audit"]["status"], date: string, result: ChecklistHit["result"] = "CONFORM", id = "a1"): ChecklistHit => ({
  result,
  audit: { id, number: 1, status, plannedDate: new Date(date), completedDate: status === "COMPLETED" ? new Date(date) : null },
});

test("codes", () => {
  assert.equal(auditCode(7), "AU-007");
  assert.equal(findingCode(7, 2), "AU-007/2");
});

test("cycleCell: getoetst, gepland, niet afgedekt", () => {
  assert.equal(cycleCell([hit("COMPLETED", "2026-03-01")], 2026).state, "assessed");
  assert.equal(cycleCell([hit("PLANNED", "2026-09-01", "NOT_ASSESSED")], 2026).state, "planned");
  assert.equal(cycleCell([hit("COMPLETED", "2026-03-01", "NOT_ASSESSED")], 2026).state, "planned");
  assert.equal(cycleCell([hit("COMPLETED", "2025-03-01")], 2026).state, "none");
  assert.equal(cycleCell([hit("CANCELLED", "2026-03-01")], 2026).state, "none");
});

test("cycleCell: afgerond wint van gepland in hetzelfde jaar", () => {
  const c = cycleCell([hit("PLANNED", "2026-10-01", "NOT_ASSESSED", "a2"), hit("COMPLETED", "2026-02-01", "FINDING", "a1")], 2026);
  assert.equal(c.state, "assessed");
  assert.deepEqual(
    c.audits.map((a) => a.id),
    ["a1"],
  );
});

test("cycleSummary telt per eis over 3 jaar", () => {
  const s = cycleSummary([[hit("COMPLETED", "2027-05-01")], [hit("PLANNED", "2028-05-01", "NOT_ASSESSED")], [], [hit("COMPLETED", "2029-05-01")]], 2026);
  assert.deepEqual({ ...s, pct: Math.round(s.pct) }, { total: 4, assessed: 1, planned: 1, uncovered: 2, pct: 25 });
});
