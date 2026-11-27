import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFields } from "./graph";

test("mapFields leest SharePoint-kolommen", () => {
  const m = mapFields({
    Status: "Vrijgegeven",
    _UIVersionString: "3.0",
    Eigenaar: { LookupValue: "Jan Jansen" },
    Revisiedatum: "2027-03-01T00:00:00Z",
    Documentnummer: "PR-001",
  });
  assert.equal(m.status, "Vrijgegeven");
  assert.equal(m.version, "3.0");
  assert.equal(m.ownerName, "Jan Jansen");
  assert.equal(m.documentNumber, "PR-001");
  assert.equal(m.revisionDate?.toISOString(), "2027-03-01T00:00:00.000Z");
});

test("mapFields negeert ongeldige datum en lege velden", () => {
  const m = mapFields({ Revisiedatum: "geen datum", Status: "" });
  assert.equal(m.revisionDate, undefined);
  assert.equal(m.status, undefined);
});
