import { test } from "node:test";
import assert from "node:assert/strict";
import { ASPECT_IMPORT_FIELDS, parseAspectType, parseSituation } from "./aspect-import";
import { buildRows, suggestMapping } from "./spreadsheet-import";

test("suggestMapping voor een gangbaar milieuaspectenregister", () => {
  const headers = [
    "Nr",
    "Activiteit",
    "Milieuaspect",
    "Milieueffect",
    "Situatie (N/A/E)",
    "F",
    "E",
    "O",
    "Score",
    "Significant",
    "Beheersmaatregelen",
    "Wetgeving",
    "Discipline",
  ];
  const m = suggestMapping(headers, ASPECT_IMPORT_FIELDS);
  assert.equal(m.externalRef, 0);
  assert.equal(m.activity, 1);
  assert.equal(m.aspect, 2);
  assert.equal(m.impact, 3);
  assert.equal(m.situation, 4);
  assert.equal(m.frequency, 5);
  assert.equal(m.severity, 6);
  assert.equal(m.extent, 7);
  assert.equal(m.score, 8);
  assert.equal(m.significant, 9);
  assert.equal(m.controls, 10);
  assert.equal(m.legalApplies, 11);
  assert.equal(m.discipline, 12);
});

test("parseSituation", () => {
  assert.equal(parseSituation("N"), "NORMAL");
  assert.equal(parseSituation(""), "NORMAL");
  assert.equal(parseSituation("Abnormaal (onderhoud)"), "ABNORMAL");
  assert.equal(parseSituation("A"), "ABNORMAL");
  assert.equal(parseSituation("Noodsituatie"), "EMERGENCY");
  assert.equal(parseSituation("E"), "EMERGENCY");
  assert.equal(parseSituation("?"), null);
});

test("parseAspectType: typeveld eerst, anders omschrijving; afvalwater ≠ afval", () => {
  assert.equal(parseAspectType("Geluid"), "NOISE");
  assert.equal(parseAspectType("", "Stofemissie bij breken"), "AIR");
  assert.equal(parseAspectType("Lozing afvalwater"), "WATER");
  assert.equal(parseAspectType("Afval (restafval)"), "WASTE");
  assert.equal(parseAspectType("Dieselverbruik shovel"), "ENERGY");
  assert.equal(parseAspectType("onbekend", "iets"), "OTHER");
});

test("buildRows: getallen F/E/O genormaliseerd, verplichte velden", () => {
  const rows = [
    ["Activiteit", "Aspect", "F", "E"],
    ["Breken", "Stof", 3, "4"],
    ["Breken", "", 2, 2],
    ["Mengen", "Geluid", "hoog", 1],
  ];
  const { rows: out, warnings } = buildRows(rows, 0, { activity: 0, aspect: 1, frequency: 2, severity: 3 }, ASPECT_IMPORT_FIELDS);
  assert.deepEqual(out, [
    { rowNumber: 2, activity: "Breken", aspect: "Stof", frequency: "3", severity: "4" },
    { rowNumber: 4, activity: "Mengen", aspect: "Geluid", severity: "1" },
  ]);
  assert.equal(warnings.length, 2);
});

test("buildRows: decimale getallen en periodes uit Excel", async () => {
  const { buildRows: build } = await import("./spreadsheet-import");
  const fields = [
    { key: "q", label: "Hoeveelheid", kind: "decimal" as const, hints: [] },
    { key: "p", label: "Periode", kind: "period" as const, hints: [] },
  ];
  const rows = [
    ["q", "p"],
    [123.456, new Date(Date.UTC(2026, 2, 1))],
    ["1.234,5", new Date(Date.UTC(2026, 2, 15))],
    [7, "Q2 2026"],
  ];
  assert.deepEqual(build(rows, 0, { q: 0, p: 1 }, fields).rows, [
    { rowNumber: 2, q: "123,456", p: "2026-03" },
    { rowNumber: 3, q: "1.234,5", p: "2026-03-15" },
    { rowNumber: 4, q: "7", p: "Q2 2026" },
  ]);
});
