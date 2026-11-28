import { test } from "node:test";
import assert from "node:assert/strict";
import { paginate } from "@/lib/paging";

test("paginate: pagina's, grenzen en alles", () => {
  const list = Array.from({ length: 250 }, (_, i) => i);
  assert.deepEqual([paginate(list, undefined).items.length, paginate(list, undefined).pages], [100, 3]);
  assert.equal(paginate(list, "3").items.length, 50);
  assert.equal(paginate(list, "9").page, 3);
  assert.equal(paginate(list, "x").page, 1);
  assert.equal(paginate(list, "alle").items.length, 250);
  assert.deepEqual([paginate([], undefined).from, paginate([], undefined).to], [0, 0]);
});
