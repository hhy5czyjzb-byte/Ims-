import { test } from "node:test";
import assert from "node:assert/strict";
import { LEGAL_IMPORT_FIELDS, parseCategory, parseStatus } from "./legal-import";
import { buildRows, findHeaderRow, parseCsv, parseDateCell, parseIntCell, parseYesNo, suggestMapping } from "./spreadsheet-import";

test("suggestMapping herkent gangbare kolomkoppen", () => {
  const headers = [
    "Nr.",
    "Wet- en regelgeving",
    "Artikel",
    "Onderwerp",
    "Omschrijving eis",
    "Discipline",
    "Verantwoordelijke",
    "Voldoet?",
    "Toelichting",
    "Datum laatste toetsing",
    "Volgende toetsing",
    "Vestiging",
  ];
  const m = suggestMapping(headers, LEGAL_IMPORT_FIELDS);
  assert.equal(m.externalRef, 0);
  assert.equal(m.title, 1);
  assert.equal(m.article, 2);
  assert.equal(m.subject, 3);
  assert.equal(m.description, 4);
  assert.equal(m.discipline, 5);
  assert.equal(m.owner, 6);
  assert.equal(m.status, 7);
  assert.equal(m.explanation, 8);
  assert.equal(m.lastReviewDate, 9);
  assert.equal(m.nextReviewDate, 10);
  assert.equal(m.location, 11);
});

test("suggestMapping gebruikt een kolom maar één keer", () => {
  const m = suggestMapping(["Wet", "Wet"], LEGAL_IMPORT_FIELDS);
  assert.equal(m.title, 0);
  assert.equal(Object.values(m).filter((c) => c === 1).length <= 1, true);
});

test("findHeaderRow slaat titelregels over", () => {
  assert.equal(findHeaderRow([["Register wet- en regelgeving 2026"], [], ["Wet", "Artikel", "Status"], ["Bal", "3.1", "ja"]]), 2);
});

test("parseCsv: puntkomma, aanhalingstekens en regeleinden", () => {
  const rows = parseCsv('﻿Wet;Toelichting\r\n"Bal";"regel 1\nregel 2"\r\nArbowet;"zei ""ja"""\n');
  assert.deepEqual(rows, [
    ["Wet", "Toelichting"],
    ["Bal", "regel 1\nregel 2"],
    ["Arbowet", 'zei "ja"'],
  ]);
  assert.deepEqual(parseCsv("a,b\n1,2"), [
    ["a", "b"],
    ["1", "2"],
  ]);
});

test("parseStatus", () => {
  assert.equal(parseStatus("Voldoet"), "COMPLIANT");
  assert.equal(parseStatus("voldoet niet"), "NON_COMPLIANT");
  assert.equal(parseStatus("Ja"), "COMPLIANT");
  assert.equal(parseStatus("nee"), "NON_COMPLIANT");
  assert.equal(parseStatus("Gedeeltelijk"), "PARTIAL");
  assert.equal(parseStatus("n.v.t."), "NOT_APPLICABLE");
  assert.equal(parseStatus(""), "NOT_ASSESSED");
  assert.equal(parseStatus("misschien"), null);
});

test("parseCategory", () => {
  assert.equal(parseCategory("Milieu"), "ENVIRONMENT");
  assert.equal(parseCategory("Arbo / VGM"), "HEALTH_SAFETY");
  assert.equal(parseCategory("Energie"), "ENERGY_CO2");
  assert.equal(parseCategory("BRL 2506"), "PRODUCT");
  assert.equal(parseCategory("iets"), "OTHER");
});

test("parseDateCell", () => {
  assert.equal(parseDateCell("01-03-2026").iso, "2026-03-01");
  assert.equal(parseDateCell("1/3/26").iso, "2026-03-01");
  assert.equal(parseDateCell("2026-03-01").iso, "2026-03-01");
  assert.equal(parseDateCell(new Date(Date.UTC(2026, 2, 1))).iso, "2026-03-01");
  assert.equal(parseDateCell(46082).iso, "2026-03-01"); // Excel-serienummer
  assert.deepEqual(parseDateCell("31-02-2026"), { iso: null, invalid: true });
  assert.deepEqual(parseDateCell("Q2"), { iso: null, invalid: true });
  assert.deepEqual(parseDateCell(""), { iso: null, invalid: false });
});

test("buildRows: koppelt kolommen, slaat lege en titelloze rijen over en waarschuwt", () => {
  const rows = [
    ["Wet", "Status", "Laatste toetsing"],
    ["Bal", "ja", "01-02-2026"],
    [null, null, null],
    ["", "nee", ""],
    ["Arbowet", "misschien", "Q2"],
  ];
  const { rows: out, warnings } = buildRows(rows, 0, { title: 0, status: 1, lastReviewDate: 2 }, LEGAL_IMPORT_FIELDS);
  assert.deepEqual(out, [
    { rowNumber: 2, title: "Bal", status: "ja", lastReviewDate: "2026-02-01" },
    { rowNumber: 5, title: "Arbowet", status: "misschien" },
  ]);
  assert.equal(warnings.length, 2); // rij zonder wet + onleesbare datum (statusherkenning toont de wizard apart)
});

test("parseIntCell en parseYesNo", () => {
  assert.deepEqual(parseIntCell("3"), { value: 3, invalid: false });
  assert.deepEqual(parseIntCell(4), { value: 4, invalid: false });
  assert.deepEqual(parseIntCell("3,0"), { value: 3, invalid: false });
  assert.deepEqual(parseIntCell("hoog"), { value: null, invalid: true });
  assert.deepEqual(parseIntCell("2,5"), { value: null, invalid: true });
  assert.deepEqual(parseIntCell(""), { value: null, invalid: false });
  assert.equal(parseYesNo("Ja"), true);
  assert.equal(parseYesNo("x"), true);
  assert.equal(parseYesNo("nee"), false);
  assert.equal(parseYesNo("niet significant"), false);
  assert.equal(parseYesNo(""), null);
  assert.equal(parseYesNo("misschien"), null);
});
