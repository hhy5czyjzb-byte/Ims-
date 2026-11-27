import { test } from "node:test";
import assert from "node:assert/strict";
import { canFillLocationAudit, completionProblems, locationAuditCode, locationAuditScore, questionKey, scoreBand } from "./location-audit";

test("code", () => {
  assert.equal(locationAuditCode(7), "CA-007");
});

test("score: voldoet / beoordeeld zonder n.v.t.", () => {
  const s = locationAuditScore(["COMPLIANT", "COMPLIANT", "PARTIAL", "NON_COMPLIANT", "NOT_APPLICABLE", "NOT_ASSESSED"]);
  assert.equal(s.total, 6);
  assert.equal(s.assessed, 5);
  assert.equal(s.notApplicable, 1);
  assert.equal(s.pct, 50); // 2 van 4
  assert.equal(locationAuditScore(["NOT_ASSESSED", "NOT_APPLICABLE"]).pct, null);
  assert.equal(locationAuditScore(["COMPLIANT", "COMPLIANT", "PARTIAL"]).pct, 66.7);
});

test("kleurband: groen vanaf 90, geel vanaf 70", () => {
  assert.equal(scoreBand(90), "good");
  assert.equal(scoreBand(89.9), "fair");
  assert.equal(scoreBand(70), "fair");
  assert.equal(scoreBand(69), "poor");
  assert.equal(scoreBand(null), "none");
});

test("invullen: QHSE of de auditor, niet na afronden", () => {
  const qhse = { id: "a", role: "QHSE" as const };
  const mk = { id: "b", role: "MIDDENKADER" as const };
  assert.equal(canFillLocationAudit(qhse, { status: "PLANNED", auditorId: null }), true);
  assert.equal(canFillLocationAudit(mk, { status: "IN_PROGRESS", auditorId: "b" }), true);
  assert.equal(canFillLocationAudit(mk, { status: "IN_PROGRESS", auditorId: "c" }), false);
  assert.equal(canFillLocationAudit(qhse, { status: "COMPLETED", auditorId: null }), false);
});

test("afronden: alles beoordeeld en acties bij 'voldoet niet'", () => {
  assert.deepEqual(completionProblems([{ verdict: "COMPLIANT", actionCount: 0 }]), []);
  assert.equal(completionProblems([]).length, 1);
  const p = completionProblems([
    { verdict: "NOT_ASSESSED", actionCount: 0 },
    { verdict: "NON_COMPLIANT", actionCount: 0 },
    { verdict: "NON_COMPLIANT", actionCount: 1 },
    { verdict: "PARTIAL", actionCount: 0 },
  ]);
  assert.equal(p.length, 2);
  assert.match(p[0], /1 vraag/);
  assert.match(p[1], /voldoet niet/);
});

test("vraagsleutel negeert hoofdletters en leestekens", () => {
  assert.equal(questionKey("W005", "Is er een vergunning?"), questionKey("w005", "is er een  vergunning"));
  assert.notEqual(questionKey("W005", "Vraag"), questionKey("W006", "Vraag"));
});
