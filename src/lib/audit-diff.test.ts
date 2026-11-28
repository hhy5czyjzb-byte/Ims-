import { test } from "node:test";
import assert from "node:assert/strict";
import { auditValue, diffFields, readChanges } from "@/lib/audit-diff";

test("diffFields: alleen gewijzigde velden, leesbaar", () => {
  const c = diffFields(
    { name: "Diesel", factor: 3.251, active: true, validFrom: new Date("2025-01-01") },
    { name: "Diesel", factor: 3.262, active: false, validFrom: new Date("2025-01-01") },
    { name: "Naam", factor: "WTW", active: "Actief", validFrom: "Geldig vanaf" },
  );
  assert.deepEqual(c, [
    { field: "factor", label: "WTW", from: "3.251", to: "3.262" },
    { field: "active", label: "Actief", from: "ja", to: "nee" },
  ]);
  assert.equal(auditValue(null), "—");
  assert.deepEqual(readChanges({ changes: c }), c);
  assert.deepEqual(readChanges({ other: 1 }), []);
});
