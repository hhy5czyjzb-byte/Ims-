import { test } from "node:test";
import assert from "node:assert/strict";
import { findingCloseProblems, rootCauseProblem } from "@/lib/corrective";
import { smartCheck } from "@/lib/objectives";

test("oorzaak verplicht bij corrigerende maatregel, niet bij andere acties", () => {
  assert.ok(rootCauseProblem("CORRECTIVE", null));
  assert.ok(rootCauseProblem("CORRECTIVE", "  "));
  assert.equal(rootCauseProblem("CORRECTIVE", "Werkinstructie ontbrak"), null);
  assert.equal(rootCauseProblem("CORRECTION", null), null);
  assert.equal(rootCauseProblem("TASK", null), null);
  assert.equal(rootCauseProblem("IMPROVEMENT", null), null);
});

test("bevinding afhandelen: major/minor vraagt oorzaak én corrigerende maatregel", () => {
  const base = { classification: "MINOR" as const, rootCause: "Oorzaak", actions: [{ status: "DONE", kind: "CORRECTIVE" as const }] };
  assert.deepEqual(findingCloseProblems(base), []);
  assert.equal(findingCloseProblems({ ...base, rootCause: null }).length, 1);
  assert.equal(findingCloseProblems({ ...base, actions: [{ status: "DONE", kind: "CORRECTION" }] }).length, 1);
  assert.equal(findingCloseProblems({ ...base, actions: [{ status: "OPEN", kind: "CORRECTIVE" }] }).length, 1);
  assert.equal(findingCloseProblems({ ...base, actions: [{ status: "CANCELLED", kind: "CORRECTIVE" }] }).length, 1);
  // observatie: geen oorzaak of corrigerende maatregel nodig
  assert.deepEqual(findingCloseProblems({ classification: "OBSERVATION", rootCause: null, actions: [] }), []);
});

test("smartCheck: alle vijf letters nodig", () => {
  const full = {
    title: "Minder ongevallen",
    description: "IF omlaag door WPI's",
    indicator: "IF",
    targetText: "≤ 3,8",
    ownerText: "QHSE-manager",
    feasibility: "2025 was al 2,24",
    deadline: new Date("2027-12-31"),
  };
  assert.equal(smartCheck(full).ok, true);
  const noT = smartCheck({ ...full, deadline: null });
  assert.equal(noT.ok, false);
  assert.equal(noT.letters.T, false);
  assert.equal(smartCheck({ ...full, deadline: null, termText: "Per kwartaal" }).ok, true);
  assert.equal(smartCheck({ ...full, targetText: "", targetValue: 3.8 }).letters.M, true);
  assert.equal(smartCheck({ ...full, feasibility: "" }).letters.R, false);
  assert.equal(smartCheck({ ...full, ownerText: null }).letters.A, false);
  assert.equal(smartCheck({ ...full, description: "" }).letters.S, false);
});
