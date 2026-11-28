import { test } from "node:test";
import assert from "node:assert/strict";
import { objectiveProgress, parseNumber, parseObjectiveCategory, parseObjectiveStatus, suggestStatus } from "@/lib/objectives";
import { objectiveWhere } from "@/lib/objective-filters";

test("objectiveProgress werkt voor stijgende en dalende doelen", () => {
  assert.deepEqual(objectiveProgress(0, 90, 45), { pct: 50, raw: 50 });
  // IF van 4,5 naar 3,8: gemeten 2,24 = ruim behaald (begrensd op 100)
  assert.equal(objectiveProgress(4.5, 3.8, 2.24)?.pct, 100);
  assert.equal(objectiveProgress(4.5, 3.8, 4.15)?.pct, 50);
  assert.equal(objectiveProgress(10, 20, 5)?.pct, 0);
  assert.equal(objectiveProgress(null, 3, 2), null);
});

test("suggestStatus vergelijkt voortgang met verstreken tijd", () => {
  const start = new Date("2026-01-01");
  const end = new Date("2026-12-31");
  const mid = new Date("2026-07-01");
  assert.equal(suggestStatus(55, start, end, mid), "ON_TRACK");
  assert.equal(suggestStatus(30, start, end, mid), "AT_RISK");
  assert.equal(suggestStatus(5, start, end, mid), "OFF_TRACK");
  assert.equal(suggestStatus(100, start, end, mid), "ACHIEVED");
  assert.equal(suggestStatus(60, start, end, new Date("2027-02-01")), "PARTIAL");
  assert.equal(suggestStatus(null, start, end, mid), null);
});

test("parseNumber, categorie en status uit tekst", () => {
  assert.equal(parseNumber("IF ≤ 3,8"), 3.8);
  assert.equal(parseNumber("56.474 liter"), 56474);
  assert.equal(parseNumber("geen"), null);
  assert.equal(parseObjectiveCategory("CO2 scope 1 en 2"), "CO2");
  assert.equal(parseObjectiveCategory("Minder ongevallen met verzuim (IF)"), "SAFETY");
  assert.equal(parseObjectiveCategory("Ziekteverzuim"), "HEALTH");
  assert.equal(parseObjectiveStatus("● Niet behaald"), "NOT_ACHIEVED");
  assert.equal(parseObjectiveStatus("● Deels"), "PARTIAL");
  assert.equal(parseObjectiveStatus("Behaald"), "ACHIEVED");
});

test("objectiveWhere: standaard alleen lopende doelstellingen", () => {
  assert.deepEqual(objectiveWhere({}), { AND: [{ active: true, status: { notIn: ["ACHIEVED", "NOT_ACHIEVED", "PARTIAL", "CANCELLED"] } }] });
  assert.deepEqual(objectiveWhere({ status: "alle", categorie: "SAFETY" }), { AND: [{ category: "SAFETY" }] });
});
