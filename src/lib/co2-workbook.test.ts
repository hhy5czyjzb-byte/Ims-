import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergePva,
  parseDataSheet,
  parseDkmpSheet,
  parseFactorSheet,
  parsePlanSheet,
  parsePvaSheet,
  parseScope,
  selectConsumptions,
  selectKpis,
  uniqueTitles,
} from "@/lib/co2-workbook";
import { carrierGroup, factorForType, measureReduction, parseStreamGroup, streamGroupOf } from "@/lib/co2";

test("parseScope: 1, 2, bt → 3, KPI", () => {
  assert.equal(parseScope(1), 1);
  assert.equal(parseScope("2"), 2);
  assert.equal(parseScope("bt"), 3);
  assert.equal(parseScope("KPI"), "KPI");
  assert.equal(parseScope("NBK"), null);
});

test("factoren: gram → kg, WTT/TTW/WTW per jaar, GJ-conversie en organisaties", () => {
  const rows = [
    [null, "OVERZICHT"],
    [
      null,
      "ORGANISATIES",
      "% IN BOUNDARY",
      "Vestiging",
      "JAARTALLEN",
      "TTW/WTW",
      "TYPE FOOTPRINT",
      "EMISSIESTROOM",
      "SCOPE",
      "EENHEID",
      "WTT Emissiefactor",
      "TTW Emissiefactor",
      "WTW Emissiefactor ",
      "Biogene Emissies",
      "EENHEID",
      "JAAR",
      null,
      "Energie eenheid",
      "ENERGIESTROOM",
      "SCOPE",
      "EENHEID",
      "CONVERSIEFACTOR",
      "Conversie kWh",
      "BRON",
    ],
    [
      null,
      "Rouwmaat",
      1,
      "Den Sliem 74",
      2015,
      "WTT",
      null,
      "Aardgasverbruik",
      1,
      "m3",
      355,
      1779,
      2134,
      null,
      "gram CO2/m3",
      2025,
      null,
      null,
      "Aardgasverbruik",
      1,
      "m3",
      0.03165,
      8.79,
      null,
    ],
    [
      null,
      "Mombarg",
      1,
      null,
      2016,
      null,
      null,
      "Elektriciteitsverbruik - grijze stroom",
      2,
      "kWh",
      83,
      414,
      497,
      null,
      "gram CO2/kWh",
      2025,
      null,
      null,
      "Elektriciteitsverbruik - grijze stroom",
      2,
      "kWh",
      0.0036,
      1,
      null,
    ],
    [
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      "Elektriciteitsverbruik - grijze stroom Kolen centrale",
      2,
      "kWh",
      "Zie opmerking",
      null,
      null,
      null,
      "gram CO2/kWh",
      2025,
    ],
    [null, null, null, null, null, null, null, "Zakelijk vervoer - gedeclareerde kilometers", "bt", "km", 48, 143, 191, null, "gram CO2/km", 2025],
  ];
  const r = parseFactorSheet(rows);
  assert.deepEqual(r.organisations, [
    { name: "Rouwmaat", boundaryPct: 100 },
    { name: "Mombarg", boundaryPct: 100 },
  ]);
  assert.equal(r.factors.length, 3);
  assert.deepEqual(r.factors[0], { stream: "Aardgasverbruik", scope: 1, unit: "m3", year: 2025, wttKg: 0.355, ttwKg: 1.779, wtwKg: 2.134, biogenicKg: null });
  assert.equal(r.factors[2].scope, 3);
  assert.equal(r.warnings.length, 1);
  assert.deepEqual(
    r.energy.map((e) => [e.stream, e.gjPerUnit]),
    [
      ["Aardgasverbruik", 0.03165],
      ["Elektriciteitsverbruik - grijze stroom", 0.0036],
    ],
  );
});

test("verbruik: heel jaar gaat voor half jaar; KPI's apart", () => {
  const rows = [
    [null, "INPUTDATA"],
    [
      null,
      "ORGANISATIE (IDENTIFICATIE)",
      "% IN BOUNDARY",
      "JAAR",
      "TYPE FOOTPRINT",
      "SCOPE EMISSIES (SCOPE 1, 2, BT en NBK)",
      "EMISSIESTROOM",
      "AANTAL",
      "AANTAL IN FOOTPRINT",
      "EENHEID (AANSLUITEND OP AANTAL)",
      "WTT",
      "TTW",
      "WTW",
      "EENHEID",
      "O",
      "P",
      "Q",
      "BRONGEGEVENS (BESTANDSNAAM)",
      "TOELICHTING",
      "VESTIGING",
    ],
    [
      null,
      "Rouwmaat",
      1,
      2025,
      "Half jaar",
      1,
      "Aardgasverbruik",
      100,
      100,
      "m3",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      "factuur H1",
      null,
      "Den Sliem 74",
    ],
    [
      null,
      "Rouwmaat",
      1,
      2025,
      "Heel jaar",
      1,
      "Aardgasverbruik",
      250,
      250,
      "m3",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      "factuur",
      "toelichting",
      "Den Sliem 74",
    ],
    [null, "Rouwmaat", 1, 2026, "Half jaar", 2, "Elektriciteitsverbruik - grijze stroom", 500, 500, "kWh"],
    [null, "Rouwmaat", 1, 2025, "Heel jaar", "KPI", "Aantal FTE", 259.6, 259.6, 0],
    [null, "Rouwmaat", 1, 2025, "Half jaar", "KPI", "Aantal FTE", 250, 250, 0],
    [null, "Rouwmaat", 1, null, null, null, null, null, 0],
  ];
  const r = parseDataSheet(rows);
  assert.equal(r.consumptions.length, 3);
  const sel = selectConsumptions(r.consumptions);
  assert.deepEqual(
    sel.map((c) => [c.year, c.quantity, c.periodStart, c.periodEnd]),
    [
      [2025, 250, "2025-01-01", "2025-12-31"],
      [2026, 500, "2026-01-01", "2026-06-30"],
    ],
  );
  assert.equal(sel[0].source, "factuur");
  assert.equal(sel[0].location, "Den Sliem 74");
  const kpis = selectKpis(r.kpis);
  assert.equal(kpis.length, 1);
  assert.equal(kpis[0].value, 259.6);
  assert.equal(kpis[0].kind, "FTE");
});

test("DKMP: secties en eenheid doorgetrokken", () => {
  const rows = [
    [
      null,
      "Emissiestroom",
      "Eenheid",
      "Bron",
      "Brondata van:",
      "Uitvoerder",
      "Datum uitvraag",
      "Datum analyse / evaluatie",
      "Afwijking? + oplossing",
      "Onzekerheden en impact",
      "Verbeterplan datakwaliteit",
    ],
    [null, "Aardgasverbruik"],
    [null, "Den Sliem 74", "m3", "Nieuwe Stroom", "Projectleider", "Administratie", "Februari", "Maart", "Nee", "Portal", "Blijven monitoren"],
    [null, "Den Sliem 78", null, "Nieuwe Stroom"],
    [null, "Brandstof wagenpark"],
    [null, "Diesel", "liter", "Tankpassen"],
  ];
  const r = parseDkmpSheet(rows);
  assert.deepEqual(
    r.items.map((i) => [i.section, i.stream, i.unit]),
    [
      ["Aardgasverbruik", "Den Sliem 74", "m3"],
      ["Aardgasverbruik", "Den Sliem 78", "m3"],
      ["Brandstof wagenpark", "Diesel", "liter"],
    ],
  );
  assert.equal(r.items[0].improvement, "Blijven monitoren");
});

test("plan van aanpak + PVA: groep, velden en reductiepercentage", () => {
  const plan = [
    [
      null,
      "Type maatregel",
      "Maatregelen",
      "Toelichting maatregel",
      "Deadline",
      "Planning",
      "SKAO/eigen maatregel? ",
      "Indien SKAO A/B/C",
      "Termijn",
      "Verantwoordelijke(n)/sleutelpersoon",
    ],
    [null, null, "Scope 1 - Brandstofverbruik"],
    [null, null, "Elektrische shovel aanschaffen", "Subsidie loopt", 2026, "Q2", "Eigen maatregel", null, "Korte termijn", "Directie"],
    [null, null, "Elektrische shovel aanschaffen", "Tweede", null, null, "SKAO", "A", "Korte termijn"],
    [null, null, "Scope 2 - Elektriciteitsverbruik"],
    [null, null, "Groene stroom met GvO", null, null, null, "Eigen maatregel"],
    [null, null, "Energiebeoordeling Beschrijf welke maatregelen"],
    [null, null, "Niet meer meenemen"],
  ];
  const p = parsePlanSheet(plan);
  assert.deepEqual(
    p.measures.map((m) => [m.streamGroup, m.title]),
    [
      ["Scope 1 - Brandstofverbruik", "Elektrische shovel aanschaffen"],
      ["Scope 1 - Brandstofverbruik", "Elektrische shovel aanschaffen"],
      ["Scope 2 - Elektriciteitsverbruik", "Groene stroom met GvO"],
    ],
  );
  assert.equal(p.measures[0].deadline, "2026");
  assert.equal(p.measures[0].owner, "Directie");
  const pva = parsePvaSheet([
    [null, null, "Basis jaar", 2025],
    [null, null, "Doel jaar", 2028],
    [null, null, "Rouwmaat heeft het doel om in 2028 een CO2-reductie van 21% te realiseren ten opzichte van 2025."],
    [null, null, "Maatregelen brandstofverbruik", "Reductie op emissiestroom (liter/kWh)", "x", "y"],
    [null, null, "Elektrische shovel aanschaffen", 0.018, 0.0167, 0.0119],
    [null, null, "Totaal op brandstof"],
    [null, null, "Maatregelen elektriciteitsverbruik"],
    [null, null, "Groene stroom met GvO", 0.772, 0.03, 0],
  ]);
  assert.equal(pva.baseYear, 2025);
  assert.equal(pva.targetYear, 2028);
  const merged = uniqueTitles(mergePva(p.measures, pva));
  assert.equal(merged[0].reductionPct?.toFixed(1), "1.8");
  assert.equal(merged[1].title, "Elektrische shovel aanschaffen (2)");
  assert.equal(merged[2].reductionPct?.toFixed(1), "77.2");
});

test("CO2-rekenhulpen: type uitstoot, groepen, emissiestroom en reductie", () => {
  assert.equal(factorForType({ factor: 3.251, ttw: 2.462, wtt: 0.788 }, "TTW"), 2.462);
  assert.equal(factorForType({ factor: 3.251, ttw: null, wtt: 0.788 }, "TTW")?.toFixed(3), "2.463");
  assert.equal(factorForType({ factor: 3.251, ttw: 2.462, wtt: null }, "WTT")?.toFixed(3), "0.789");
  assert.equal(carrierGroup({ name: "Brandstofverbruik wagenpark - diesel", defaultScope: 1 }), "Brandstofverbruik wagenpark");
  assert.equal(carrierGroup({ name: "Aspen", defaultScope: 1 }), "Brandstofverbruik wagenpark");
  assert.equal(carrierGroup({ name: "Elektriciteitsverbruik - wagens", defaultScope: 2 }), "Elektriciteitsverbruik wagenpark");
  assert.equal(carrierGroup({ name: "Elektriciteitsverbruik - grijze stroom", defaultScope: 2 }), "Elektriciteitsverbruik vastgoed");
  assert.equal(carrierGroup({ name: "Diesel", defaultScope: 1, reportGroup: "Brandstofverbruik bedrijfsmiddelen" }), "Brandstofverbruik bedrijfsmiddelen");
  assert.equal(streamGroupOf({ name: "Aardgasverbruik", defaultScope: 1 }), "Scope 1 - Aardgasverbruik");
  assert.equal(streamGroupOf({ name: "Brandstofverbruik bedrijfsmiddelen - diesel", defaultScope: 1 }), "Scope 1 - Brandstofverbruik");
  assert.equal(parseStreamGroup("Scope 2 - Elektriciteitsverbruik"), "Scope 2 - Elektriciteitsverbruik");
  const r = measureReduction({ reductionPct: 1.8, streamKg: 8_264_000, totalKg: 8_869_830 });
  assert.equal(Math.round(r!.kg / 1000), 149);
  assert.equal(r!.pctOfTotal.toFixed(2), "1.68");
});

test("plan van aanpak: onderdelen energiebeoordeling, volgorde en doelstelling per scope", () => {
  const H = [
    null,
    "Type maatregel",
    "Maatregelen",
    "Toelichting maatregel",
    "Deadline",
    "Planning",
    "SKAO/eigen maatregel?",
    "Indien SKAO A/B/C",
    "Termijn",
    "Verantwoordelijke(n)",
  ];
  const plan = parsePlanSheet([
    [null, null, null, null, "Onderdeel van het energiemanagement actieplan"],
    H,
    [null, null, "Scope 1 - Aardgasverbruik"],
    [null, "Directe reductiemaatregel", "Warmtepomp", "uitleg", 2025, "Maart", "Eigen maatregel", "N.v.t.", "Korte termijn", "Facilitair"],
    [null, null, "Scope 2 - Elektriciteitsverbruik"],
    [null, "Directe reductiemaatregel", "Groene stroom", null, "Doorlopend", null, "SKAO", "A", "Korte termijn", "Directie"],
    [null, null, "Scope 2 - Warmteverbruik"],
    [null, null, null, "#REF!"],
    [null, null, "Energiebeoordeling Beschrijf welke maatregelen zijn opgenomen"],
    [null, null, "Maatregelen opgenomen in plan van aanpak"],
    [null, null, "Verbetering van inzicht"],
    [
      null,
      "Ondersteunende reductiemaatregel",
      "App voor CO2-bewustzijn",
      "Rouwmaat App",
      "Doorlopend",
      null,
      "Eigen maatregel",
      "N.v.t.",
      "Korte termijn",
      "QHSE",
    ],
    [null, null, "Bevindingen uit de directiebeoordeling voorgaande jaren"],
    [null, null, "Geen bevindingen"],
    [null, null, "Bevindingen uit de externe audit voorgaand"],
    [null, null, "Optelsom Categorie A maatregel", 0],
  ]);
  assert.deepEqual(
    plan.measures.map((m) => [m.streamGroup, m.title, m.deadline, m.sortOrder]),
    [
      ["Scope 1 - Aardgasverbruik", "Warmtepomp", "2025", 1],
      ["Scope 2 - Elektriciteitsverbruik", "Groene stroom", "Doorlopend", 2],
      ["Verbetering van inzicht", "App voor CO2-bewustzijn", "Doorlopend", 3],
    ],
  );
  assert.match(plan.doc.intro ?? "", /^Beschrijf welke/);
  assert.deepEqual(
    plan.doc.sections.map((s) => [s.title, s.text]),
    [
      ["Maatregelen opgenomen in plan van aanpak", null],
      ["Verbetering van inzicht", null],
      ["Bevindingen uit de directiebeoordeling voorgaande jaren", "Geen bevindingen"],
      ["Bevindingen uit de externe audit voorgaand jaar", null],
    ],
  );

  const pva = parsePvaSheet([
    [null, null, "Organisatie", "Rouwmaat"],
    [null, null, "Laatst opgestelde doelstelling jaar", "2024"],
    [null, null, "Basis jaar", "2025"],
    [null, null, "Doel jaar", "2028"],
    [null, null, "Type uitstoot ", "WTW"],
    [null, null, "Doelstelling Scope 1, 2 & 3"],
    [null, null, "Rouwmaat heeft het doel om in 2028 een CO2-reductie van 21% te realiseren ten opzichte van 2025."],
    [null, null, "Doelstelling Scope 1 & 2"],
    [null, null, "Rouwmaat heeft het doel om in 2028 een CO2-reductie van 21% te realiseren in scope 1 & 2."],
    [null, null, "Reductiedoelstellingen", "Reductie op totaal (CO2)", "Reductie op totaal (GJ)"],
    [null, null, "Scope 1", 0.1761, 0.1272],
    [null, null, "Scope 2", 0.0379, -0.0437],
    [null, null, "Scope 3", "0", "nvt"],
    [null, null, "Totaal", 0.214, 0.0834],
    [null, null, "Reductiepotentieel per scope", "Reductie op scope (CO2)", "Reductie t.o.v scope 1 & 2", "Reductie op scope (GJ)"],
    [null, null, "Scope 1", 0.1871, 0.1761, 0.139],
    [null, null, "Scope 2", 0.7729, 0.0379, -0.0437],
    [null, null, "Scope 3", 0.075, "nvt", "nvt"],
    [null, null, "Tussendoelstellingen", "Scope 1", "Scope 2", "Scope 3", "Totaal"],
    [null, null, "2025"],
    [null, null, "2026", 0.06, 0.25, null, 0.07],
    [null, null, "Scope 1"],
    [
      null,
      null,
      "Maatregelen brandstofverbruik",
      "Reductie op emissiestroom",
      "Reductie op totaal (CO2)",
      "Reductie op energie",
      "Reductie op totaal (GJ)",
      "indicatie",
    ],
    [null, null, "Elektrische shovel aanschaffen", 0.018, 0.0168, 0.0119, 0.0107, "1"],
    [null, null, "Totaal op brandstofverbruik", 0.189],
  ]);
  assert.equal(pva.target.text12, "Rouwmaat heeft het doel om in 2028 een CO2-reductie van 21% te realiseren in scope 1 & 2.");
  assert.equal(pva.target.lastTargetYear, 2024);
  assert.deepEqual(
    pva.target.scopes.map((s) => [s.scope, s.totalCo2Pct, s.potentialCo2Pct]),
    [
      [1, 17.61, 18.71],
      [2, 3.79, 77.29],
      [3, 0, 7.5],
    ],
  );
  assert.equal(pva.target.totalCo2Pct, 21.4);
  assert.deepEqual(pva.target.milestones, [{ year: 2026, scope1: 6, scope2: 25, scope3: null, total: 7, lastTarget: null, energy: null }]);
  assert.deepEqual(pva.reductions.get("elektrische shovel aanschaffen"), { reductionPct: 1.8, energyReductionPct: 1.19, indication: "1" });
});
