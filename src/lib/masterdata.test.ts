import { test } from "node:test";
import assert from "node:assert/strict";
import { disciplineMap, splitList } from "./masterdata";

test("bedrijfsonderdeel op naam en alternatieve naam", () => {
  const m = disciplineMap([
    { id: "a", name: "Afval/Transport", aliases: ["Afval & Recycling", "Transport"] },
    { id: "b", name: "Beton", aliases: [] },
    { id: "c", name: "Transport" }, // eigen naam wint van een alias elders
  ]);
  assert.equal(m.get("afval & recycling"), "a");
  assert.equal(m.get("beton"), "b");
  assert.equal(m.get("transport"), "c");
});

test("splitList", () => {
  assert.deepEqual(splitList("Afval & Recycling; Transport, Transport\n"), ["Afval & Recycling", "Transport"]);
  assert.deepEqual(splitList(""), []);
});
