import { test } from "node:test";
import assert from "node:assert/strict";
import { compareRequirementFlat } from "./lookups";

test("platte lijst eisen sorteert op paragraaf over alle niveaus", () => {
  const r = (clause: string, sortOrder: number) => ({ clause, sortOrder });
  // sortOrder is per niveau (10, 20, …) en mag de platte volgorde niet bepalen
  const list = [r("5.1", 10), r("4.2", 20), r("10.1", 10), r("4.1", 10), r("6.1.1", 10), r("4", 10), r("9.1.2", 20)];
  assert.deepEqual(
    [...list].sort(compareRequirementFlat).map((x) => x.clause),
    ["4", "4.1", "4.2", "5.1", "6.1.1", "9.1.2", "10.1"],
  );
});
