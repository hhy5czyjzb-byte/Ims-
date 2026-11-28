import { test } from "node:test";
import assert from "node:assert/strict";
import { actionWhere } from "./action-filters";

test("actionWhere: standaard lopend; filters gecombineerd; onbekende waarden genegeerd", () => {
  const now = new Date("2026-11-28T10:00:00Z");
  assert.deepEqual(actionWhere({}, "u1", now), { AND: [{ status: { in: ["OPEN", "IN_PROGRESS"] } }] });
  assert.deepEqual(actionWhere({ status: "alle", bron: "x", soort: "y" }, "u1", now), {});
  const w = actionWhere({ status: "verlopen", bron: "INCIDENT", eigenaar: "mij", soort: "CORRECTIVE" }, "u1", now).AND as unknown[];
  assert.deepEqual(w[1], { deadline: { lt: new Date("2026-11-28T00:00:00Z") } });
  assert.deepEqual(w.slice(2), [{ source: "INCIDENT" }, { kind: "CORRECTIVE" }, { ownerId: "u1" }]);
  assert.deepEqual(actionWhere({ status: "alle", eigenaar: "geen" }, "u1", now), { AND: [{ ownerId: null, ownerText: null }] });
});
