import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ASPECT_IMPORT_FIELDS,
  parseInOperation,
  parseLifecycle,
  parseOpportunity,
  parsePriority,
  parseSiteType,
  parseSituation,
  splitRefs,
} from "./aspect-import";
import { suggestMapping } from "./spreadsheet-import";

const MAR_HEADERS = [
  "Nr.",
  "Bedrijfsonderdeel",
  "Locatie",
  "Type",
  "Status locatie",
  "Activiteit",
  "MBA (Bal)",
  "Milieuthema",
  "Milieuaspect",
  "Milieueffect",
  "Contextfactor",
  "Wettelijke eis",
  "Wet- en regelgeving",
  "Register nr.",
  "Risico- en kansenregister",
  "Stakeholders",
  "Klachten",
  "Voorzieningen",
  "Effect",
  "Voorkomen",
  "Waarschijnlijkheid",
  "Risico",
  "Risiconiveau",
  "Kans of bedreiging",
  "Prio",
  "Signaal prio en risico",
  "Onderbouwing prio",
  "Grondstofwinning",
  "Ontwerp",
  "Productie",
  "Transport",
  "Gebruik",
  "Einde levensduur",
  "Definitieve verwijdering",
  "Bron levenscyclus",
  "Maatregel",
  "Eigenaar",
  "Herkomst",
];

test("suggestMapping koppelt alle kolommen van het MAR van Rouwmaat", () => {
  const m = suggestMapping(MAR_HEADERS, ASPECT_IMPORT_FIELDS);
  const col = (h: string) => MAR_HEADERS.indexOf(h);
  const expect: Record<string, string> = {
    externalRef: "Nr.",
    businessUnit: "Bedrijfsonderdeel",
    location: "Locatie",
    siteType: "Type",
    siteStatus: "Status locatie",
    activity: "Activiteit",
    mba: "MBA (Bal)",
    theme: "Milieuthema",
    aspect: "Milieuaspect",
    impact: "Milieueffect",
    contextFactor: "Contextfactor",
    legalApplies: "Wettelijke eis",
    legalText: "Wet- en regelgeving",
    legalRefs: "Register nr.",
    riskRefs: "Risico- en kansenregister",
    stakeholders: "Stakeholders",
    complaints: "Klachten",
    controls: "Voorzieningen",
    effect: "Effect",
    exposure: "Voorkomen",
    probability: "Waarschijnlijkheid",
    opportunity: "Kans of bedreiging",
    priority: "Prio",
    priorityRationale: "Onderbouwing prio",
    lcRawMaterials: "Grondstofwinning",
    lcDesign: "Ontwerp",
    lcProduction: "Productie",
    lcTransport: "Transport",
    lcUse: "Gebruik",
    lcEndOfLife: "Einde levensduur",
    lcDisposal: "Definitieve verwijdering",
    lifecycleSource: "Bron levenscyclus",
    measure: "Maatregel",
    owner: "Eigenaar",
    origin: "Herkomst",
  };
  for (const [key, header] of Object.entries(expect)) assert.equal(m[key], col(header), `${key} → ${header}`);
  // berekende kolommen worden niet gekoppeld
  for (const h of ["Risico", "Risiconiveau", "Signaal prio en risico"]) assert.ok(!Object.values(m).includes(col(h)), h);
});

test("prio, kans/bedreiging, type, status", () => {
  assert.equal(parsePriority("H"), "HIGH");
  assert.equal(parsePriority("middel"), "MEDIUM");
  assert.equal(parsePriority("L"), "LOW");
  assert.equal(parsePriority(""), null);
  assert.equal(parsePriority("x"), undefined);
  assert.equal(parseOpportunity("Kans"), true);
  assert.equal(parseOpportunity("Bedreiging"), false);
  assert.equal(parseOpportunity(""), undefined);
  assert.equal(parseSiteType("Project"), "PROJECT");
  assert.equal(parseSiteType("Groep"), "GROUP");
  assert.equal(parseSiteType("Vestiging"), "SITE");
  assert.equal(parseInOperation("In werking"), true);
  assert.equal(parseInOperation("Tijdelijk niet in werking"), false);
});

test("levenscyclus en nummers", () => {
  assert.equal(parseLifecycle("2"), 2);
  assert.equal(parseLifecycle(""), null);
  assert.equal(parseLifecycle("5"), undefined);
  assert.deepEqual(splitRefs("W001, W013"), ["W001", "W013"]);
  assert.deepEqual(splitRefs("R01, R02, K01; r01"), ["R01", "R02", "K01"]);
  assert.deepEqual(splitRefs("-"), []);
});

test("parseSituation", () => {
  assert.equal(parseSituation("N"), "NORMAL");
  assert.equal(parseSituation(""), "NORMAL");
  assert.equal(parseSituation("Noodsituatie"), "EMERGENCY");
  assert.equal(parseSituation("?"), null);
});
