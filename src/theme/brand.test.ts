import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { brand } from "./brand";

// Bewaakt dat brand.ts en de CSS-variabelen in globals.css gelijk blijven.
test("huisstijlkleuren in globals.css komen overeen met brand.ts", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8").toLowerCase();
  const map: Record<string, string> = {
    "--color-brand-red": brand.colors.red,
    "--color-brand-red-dark": brand.colors.redDark,
    "--color-brand-grey-light": brand.colors.greyLight,
    "--color-brand-grey-dark": brand.colors.greyDark,
  };
  for (const [v, hex] of Object.entries(map)) {
    assert.ok(css.includes(`${v}: ${hex.toLowerCase()};`), `${v} moet ${hex} zijn`);
  }
});
