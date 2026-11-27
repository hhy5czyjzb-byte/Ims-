import { test } from "node:test";
import assert from "node:assert/strict";
import { csvField, riskWhere } from "./risk-filters";

test("csvField: escapen en formule-injectie voorkomen", () => {
  assert.equal(csvField("gewoon"), "gewoon");
  assert.equal(csvField('a;b "c"'), '"a;b ""c"""');
  assert.equal(csvField("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvField(null), "");
  assert.equal(csvField(12), "12");
});

test("riskWhere: standaard zonder afgesloten items, onbekende waarden genegeerd", () => {
  assert.deepEqual(riskWhere({}), { status: { not: "CLOSED" } });
  assert.deepEqual(riskWhere({ status: "alle", soort: "x", categorie: "y" }), {});
  assert.deepEqual(riskWhere({ status: "OPEN", soort: "RISK" }), { type: "RISK", status: "OPEN" });
});
