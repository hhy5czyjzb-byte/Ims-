import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actionSourceForReport,
  parseInjury,
  parseReportOrigin,
  parseReportSeverity,
  parseReportStatus,
  parseReportType,
  reportCloseProblems,
  reportCode,
} from "./reports";
import { parseActionKind, parseActionPriority, parseActionSource, parseActionStatus } from "./action-import";

test("code en bron", () => {
  assert.equal(reportCode(12), "M-012");
  assert.equal(actionSourceForReport("ACCIDENT"), "INCIDENT");
  assert.equal(actionSourceForReport("COMPLAINT"), "COMPLAINT");
  assert.equal(actionSourceForReport("NONCONFORMITY"), "NONCONFORMITY");
});

test("afsluiten: acties gereed, oorzaak en effectiviteit bij afwijkingen en ongevallen", () => {
  assert.deepEqual(reportCloseProblems({ type: "IMPROVEMENT", rootCause: null, effective: null, actions: [{ status: "DONE" }] }), []);
  const p = reportCloseProblems({ type: "ACCIDENT", rootCause: "", effective: null, actions: [{ status: "OPEN" }, { status: "CANCELLED" }] });
  assert.equal(p.length, 3);
  assert.deepEqual(reportCloseProblems({ type: "NONCONFORMITY", rootCause: "Werkinstructie onduidelijk", effective: true, actions: [] }), []);
});

test("herkennen bij import (meldingen)", () => {
  assert.equal(parseReportType("Bijna-ongeval"), "NEAR_MISS");
  assert.equal(parseReportType("Ongeval met verzuim"), "ACCIDENT");
  assert.equal(parseReportType("NC minor"), "NONCONFORMITY");
  assert.equal(parseReportType("Klacht klant"), "COMPLAINT");
  assert.equal(parseReportType("Lekkage diesel"), "ENVIRONMENTAL_INCIDENT");
  assert.equal(parseReportType(""), null);
  assert.equal(parseReportSeverity("Hoog"), "HIGH");
  assert.equal(parseInjury("EHBO"), "FIRST_AID");
  assert.equal(parseInjury("verzuim"), "LOST_TIME");
  assert.equal(parseReportStatus("Afgesloten"), "CLOSED");
  assert.equal(parseReportStatus("In behandeling"), "IN_PROGRESS");
  assert.equal(parseReportOrigin("Opdrachtgever"), "CUSTOMER");
});

test("herkennen bij import (acties)", () => {
  assert.equal(parseActionStatus("Gereed"), "DONE");
  assert.equal(parseActionStatus("loopt"), "IN_PROGRESS");
  assert.equal(parseActionStatus("x"), null);
  assert.equal(parseActionKind("Corrigerende maatregel"), "CORRECTIVE");
  assert.equal(parseActionKind("Directe correctie"), "CORRECTION");
  assert.equal(parseActionPriority("Hoog"), "HIGH");
  assert.equal(parseActionSource("Interne audit ISO 9001"), "AUDIT");
  assert.equal(parseActionSource("Bijna-ongeval werf"), "INCIDENT");
  assert.equal(parseActionSource("Directiebeoordeling 2026"), "MANAGEMENT_REVIEW");
  assert.equal(parseActionSource(""), "MANUAL");
});
