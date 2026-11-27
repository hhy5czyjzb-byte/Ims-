import { test } from "node:test";
import assert from "node:assert/strict";
import { can, canAssessLegal, canEditAction, canEditRisk, roleFromGroups } from "./rbac";

const cfg = { kam: "g-kam", directie: "g-dir", middenkader: "g-mk" };

test("roleFromGroups: hoogste rol wint", () => {
  assert.equal(roleFromGroups(["g-mk", "g-kam"], cfg), "KAM");
  assert.equal(roleFromGroups(["g-mk", "g-dir"], cfg), "DIRECTIE");
  assert.equal(roleFromGroups(["g-mk"], cfg), "MIDDENKADER");
});

test("roleFromGroups: geen passende groep = geen toegang", () => {
  assert.equal(roleFromGroups(["iets-anders"], cfg), null);
  assert.equal(roleFromGroups([], cfg), null);
  assert.equal(roleFromGroups(undefined, cfg), null);
  assert.equal(roleFromGroups(["g-kam"], {}), null);
});

test("can: alleen KAM beheert normen", () => {
  assert.equal(can("KAM", "norms.edit"), true);
  assert.equal(can("DIRECTIE", "norms.edit"), false);
  assert.equal(can("MIDDENKADER", "norms.edit"), false);
  assert.equal(can(null, "actions.create"), false);
});

test("canEditAction: eigenaar of aanmaker, of KAM", () => {
  const a = { ownerId: "u1", createdById: "u2" };
  assert.equal(canEditAction({ id: "u1", role: "MIDDENKADER" }, a), true);
  assert.equal(canEditAction({ id: "u2", role: "MIDDENKADER" }, a), true);
  assert.equal(canEditAction({ id: "u3", role: "MIDDENKADER" }, a), false);
  assert.equal(canEditAction({ id: "u3", role: "DIRECTIE" }, a), false);
  assert.equal(canEditAction({ id: "u3", role: "KAM" }, a), true);
});

test("canEditRisk: KAM altijd, middenkader alleen eigen, directie nooit", () => {
  const r = { ownerId: "u1", createdById: "u2" };
  assert.equal(canEditRisk({ id: "x", role: "KAM" }, r), true);
  assert.equal(canEditRisk({ id: "u1", role: "MIDDENKADER" }, r), true);
  assert.equal(canEditRisk({ id: "u2", role: "MIDDENKADER" }, r), true);
  assert.equal(canEditRisk({ id: "u3", role: "MIDDENKADER" }, r), false);
  assert.equal(canEditRisk({ id: "u1", role: "DIRECTIE" }, r), false);
});

test("canAssessLegal: KAM altijd, middenkader alleen als eigenaar, directie niet", () => {
  assert.equal(canAssessLegal({ id: "x", role: "KAM" }, { ownerId: null }), true);
  assert.equal(canAssessLegal({ id: "u1", role: "MIDDENKADER" }, { ownerId: "u1" }), true);
  assert.equal(canAssessLegal({ id: "u2", role: "MIDDENKADER" }, { ownerId: "u1" }), false);
  assert.equal(canAssessLegal({ id: "u1", role: "DIRECTIE" }, { ownerId: "u1" }), false);
});
