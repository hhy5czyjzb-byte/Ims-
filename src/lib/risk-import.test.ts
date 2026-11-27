import { test } from "node:test";
import assert from "node:assert/strict";
import { RISK_IMPORT_FIELDS, categoryFromTheme, parseRiskType, parseStrategic, parseTreatmentStatus, splitBUs } from "./risk-import";
import { suggestMapping } from "./spreadsheet-import";

test("kolommen van het register Rouwmaat (tabblad Risico's) worden herkend", () => {
  const h = [
    "Nr.",
    "Omschrijving",
    "Herkomst",
    "Prioriteit",
    "Contextfactor",
    "Thema",
    "BU",
    "Oorzaak / context",
    "Gevolg",
    "Kans",
    "Effect",
    "Score",
    "Niveau",
    "Beheersmaatregel",
    "Eigenaar",
    "Termijn",
    "Status",
    "Monitoring / KPI",
    "Kader",
    "Restkans",
    "Resteffect",
    "Restscore",
    "Laatst beoordeeld",
    "Opmerking",
  ];
  const m = suggestMapping(h, RISK_IMPORT_FIELDS);
  const expect: Record<string, string> = {
    externalRef: "Nr.",
    title: "Omschrijving",
    origin: "Herkomst",
    priority: "Prioriteit",
    contextFactor: "Contextfactor",
    theme: "Thema",
    bu: "BU",
    cause: "Oorzaak / context",
    consequence: "Gevolg",
    likelihood: "Kans",
    impact: "Effect",
    measures: "Beheersmaatregel",
    owner: "Eigenaar",
    term: "Termijn",
    treatmentStatus: "Status",
    monitoring: "Monitoring / KPI",
    framework: "Kader",
    likelihoodAfter: "Restkans",
    impactAfter: "Resteffect",
    lastReviewedAt: "Laatst beoordeeld",
    notes: "Opmerking",
  };
  for (const [k, header] of Object.entries(expect)) assert.equal(h[m[k]], header, k);
  assert.ok(!Object.values(m).includes(h.indexOf("Score")) && !Object.values(m).includes(h.indexOf("Restscore")));
});

test("kolommen van het tabblad Kansen", () => {
  const h = [
    "Nr.",
    "Omschrijving",
    "Herkomst",
    "Prioriteit",
    "Contextfactor",
    "Thema",
    "BU",
    "Aanleiding",
    "Opbrengst",
    "Kans",
    "Effect",
    "Score",
    "Niveau",
    "Actie om te benutten",
    "Eigenaar",
    "Termijn",
    "Status",
    "Monitoring / KPI",
    "Kader",
    "Laatst beoordeeld",
    "Opmerking",
  ];
  const m = suggestMapping(h, RISK_IMPORT_FIELDS);
  assert.equal(h[m.cause], "Aanleiding");
  assert.equal(h[m.consequence], "Opbrengst");
  assert.equal(h[m.measures], "Actie om te benutten");
  assert.equal(h[m.likelihood], "Kans");
});

test("herkenning", () => {
  assert.equal(parseRiskType("", "K07"), "OPPORTUNITY");
  assert.equal(parseRiskType("", "R07"), "RISK");
  assert.equal(parseRiskType("Kans", "X1"), "OPPORTUNITY");
  assert.equal(parseStrategic("★ 1 · Strategisch", ""), true);
  assert.equal(parseStrategic("3 · Regulier", "Aanvullend"), false);
  assert.equal(parseStrategic("", "Contextanalyse"), true);
  assert.equal(parseTreatmentStatus("In uitvoering"), "IN_PROGRESS");
  assert.equal(parseTreatmentStatus("Doorlopend"), "ONGOING");
  assert.equal(parseTreatmentStatus("Afgerond"), "DONE");
  assert.equal(parseTreatmentStatus("??"), null);
  assert.deepEqual(splitBUs("Afval/Transport, Beton"), ["Afval/Transport", "Beton"]);
  assert.deepEqual(splitBUs("Groep"), []);
  assert.equal(categoryFromTheme("Wet- en regelgeving"), "COMPLIANCE");
  assert.equal(categoryFromTheme("Energie en CO₂"), "CO2");
  assert.equal(categoryFromTheme("Veiligheid"), "SAFETY");
  assert.equal(categoryFromTheme("Markt"), "STRATEGIC");
});
