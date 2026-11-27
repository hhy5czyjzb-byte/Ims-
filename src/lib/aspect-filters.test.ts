import { test } from "node:test";
import assert from "node:assert/strict";
import { aspectWhere } from "./aspect-filters";

test("aspectWhere: standaard actief, onbekende waarden genegeerd, filters gecombineerd", () => {
  assert.deepEqual(aspectWhere({}, "u1"), { AND: [{ active: true }] });
  assert.deepEqual(aspectWhere({ type: "x", situatie: "y", significant: "z", actief: "alle" }, "u1"), {});
  assert.deepEqual(aspectWhere({ significant: "ja", type: "AIR", eigenaar: "mij", co2: "ja" }, "u1").AND, [
    { active: true },
    { significant: true },
    { aspectType: "AIR" },
    { ownerId: "u1" },
    { co2Relevant: true },
  ]);
});
