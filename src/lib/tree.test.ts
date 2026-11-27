import { test } from "node:test";
import assert from "node:assert/strict";
import { flattenTree } from "./tree";

test("flattenTree sorteert natuurlijk en diepte-eerst", () => {
  const r = (id: string, clause: string, parentId: string | null = null) => ({ id, clause, parentId, sortOrder: 0 });
  const out = flattenTree([r("c", "4.10", "a"), r("a", "4"), r("b", "4.9", "a"), r("d", "5")]);
  assert.deepEqual(
    out.map((x) => [x.clause, x.depth]),
    [
      ["4", 0],
      ["4.9", 1],
      ["4.10", 1],
      ["5", 0],
    ],
  );
});
