import { test } from "node:test";
import assert from "node:assert/strict";
import { legalWhere } from "./legal-filters";

test("legalWhere: standaard alleen actieve eisen; onbekende waarden genegeerd", () => {
  assert.deepEqual(legalWhere({}, "u1"), { AND: [{ active: true }] });
  assert.deepEqual(legalWhere({ status: "x", categorie: "y", actief: "alle" }, "u1"), {});
});

test("legalWhere: filters op hetzelfde veld blijven allebei gelden", () => {
  const now = new Date("2026-06-15T10:00:00Z");
  const w = legalWhere({ status: "actie", eigenaar: "mij", toetsing: "verlopen" }, "u1", now);
  assert.deepEqual(w.AND, [
    { active: true },
    { status: { in: ["NON_COMPLIANT", "PARTIAL"] } },
    { ownerId: "u1" },
    { nextReviewDate: { lt: new Date("2026-06-15T00:00:00Z") } },
    { status: { not: "NOT_APPLICABLE" } },
  ]);
});
