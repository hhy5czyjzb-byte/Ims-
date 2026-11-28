/**
 * Inlezen van het CO2-dashboard (Excel, handboek 4.0) van Rouwmaat. Pure functies op de rijen per tabblad
 * (zoals read-excel-file ze geeft), zodat dit in de browser draait en te testen is.
 *
 * Tabbladen:
 * - "Scope 1&2 Input keuzevariabelen": organisaties (% in boundary), vestigingen, emissiefactoren per jaar
 *   (WTT/TTW/WTW/biogeen in gram per eenheid) en energie-conversiefactoren (GJ per eenheid).
 * - "Data scope 1&2": verbruik per organisatie, jaar, type footprint (heel/half jaar), emissiestroom, aantal, bron, vestiging;
 *   KPI-regels (aantal FTE, behaalde omzet).
 * - "DKMP": datakwaliteitsmanagementplan per emissiestroom.
 * - "Plan van aanpak" + "PVA - berekening doelstelling": maatregelen met reductiepercentage op de emissiestroom.
 */

import { PLAN_SECTIONS } from "@/lib/co2";

export type Cell = string | number | boolean | Date | null | undefined;
export type Rows = Cell[][];

const str = (v: Cell): string =>
  (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).replace(/\s+/g, " ").trim();
const num = (v: Cell): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = str(v);
  if (!s || /[a-z]/i.test(s.replace(/e[-+]?\d+$/i, ""))) return null;
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9%&]+/g, " ")
    .trim();

/** Eerste rij waarin alle opgegeven kopteksten voorkomen (deels, hoofdletterongevoelig). */
function findHeader(rows: Rows, needles: string[], maxRow = 40): number {
  for (let i = 0; i < Math.min(rows.length, maxRow); i++) {
    const cells = (rows[i] ?? []).map((c) => norm(str(c)));
    if (needles.every((n) => cells.some((c) => c.includes(norm(n))))) return i;
  }
  return -1;
}
const colOf = (header: Cell[], needle: string, from = 0) => header.findIndex((c, i) => i >= from && norm(str(c)).includes(norm(needle)));

export type WorkbookFactor = {
  stream: string;
  scope: 1 | 2 | 3;
  unit: string;
  year: number;
  wttKg: number | null;
  ttwKg: number | null;
  wtwKg: number;
  biogenicKg: number | null;
};
export type WorkbookEnergy = { stream: string; scope: number | null; unit: string; gjPerUnit: number; source: string | null };
export type WorkbookOrganisation = { name: string; boundaryPct: number };

/** Scope uit het dashboard: 1, 2, "bt" (business travel → scope 3); KPI en NBK worden overgeslagen. */
export function parseScope(v: Cell): 1 | 2 | 3 | "KPI" | null {
  const s = str(v).toLowerCase();
  if (s === "1") return 1;
  if (s === "2") return 2;
  if (s === "3" || s === "bt") return 3;
  if (s === "kpi") return "KPI";
  return null;
}

export function parseFactorSheet(rows: Rows) {
  const h = findHeader(rows, ["EMISSIESTROOM", "WTW"]);
  if (h < 0)
    return { organisations: [], locations: [], factors: [], energy: [], warnings: ["Tabblad keuzevariabelen: kopregel met EMISSIESTROOM/WTW niet gevonden."] };
  const header = rows[h];
  const c = {
    org: colOf(header, "ORGANISATIES"),
    pct: colOf(header, "% IN BOUNDARY"),
    loc: colOf(header, "Vestiging"),
    stream: colOf(header, "EMISSIESTROOM"),
    wtt: colOf(header, "WTT Emissiefactor"),
    ttw: colOf(header, "TTW Emissiefactor"),
    wtw: colOf(header, "WTW Emissiefactor"),
    bio: colOf(header, "Biogene"),
    energy: colOf(header, "ENERGIESTROOM"),
  };
  c.stream = c.stream < 0 ? 0 : c.stream;
  const scopeCol = c.stream + 1;
  const unitCol = c.stream + 2;
  const yearCol = colOf(header, "JAAR", c.wtw);
  const organisations: WorkbookOrganisation[] = [];
  const locations: string[] = [];
  const factors: WorkbookFactor[] = [];
  const energy: WorkbookEnergy[] = [];
  const warnings: string[] = [];
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    if (c.org >= 0 && str(r[c.org]) && c.pct >= 0 && num(r[c.pct]) !== null)
      organisations.push({ name: str(r[c.org]), boundaryPct: num(r[c.pct])! * (num(r[c.pct])! <= 1 ? 100 : 1) });
    if (c.loc >= 0 && str(r[c.loc])) locations.push(str(r[c.loc]));
    const stream = str(r[c.stream]);
    const scope = parseScope(r[scopeCol]);
    const year = num(r[yearCol]);
    const wtw = num(r[c.wtw]);
    if (stream && (scope === 1 || scope === 2 || scope === 3) && year && year > 1990 && year < 2100) {
      if (wtw === null) {
        if (str(r[c.wtw]) || str(r[c.wtt])) warnings.push(`${stream} ${year}: geen WTW-factor (${str(r[c.wtt]) || "leeg"}) — overgeslagen`);
      } else {
        const g = (v: Cell) => (num(v) === null ? null : num(v)! / 1000);
        factors.push({
          stream,
          scope,
          unit: str(r[unitCol]),
          year,
          wttKg: g(r[c.wtt]),
          ttwKg: g(r[c.ttw]),
          wtwKg: wtw / 1000,
          biogenicKg: c.bio >= 0 ? g(r[c.bio]) : null,
        });
      }
    }
    if (c.energy >= 0) {
      const es = str(r[c.energy]);
      const conv = num(r[c.energy + 3]);
      const eScope = num(r[c.energy + 1]);
      if (es && conv !== null && conv > 0 && eScope !== null)
        energy.push({ stream: es, scope: eScope, unit: str(r[c.energy + 2]), gjPerUnit: conv, source: str(r[c.energy + 5]) || null });
    }
  }
  return { organisations, locations: [...new Set(locations)], factors, energy, warnings };
}

export type WorkbookConsumption = {
  row: number;
  organisation: string;
  year: number;
  footprintType: "Heel jaar" | "Half jaar";
  scope: 1 | 2 | 3;
  stream: string;
  quantity: number;
  unit: string;
  source: string | null;
  note: string | null;
  location: string | null;
};
export type WorkbookKpi = {
  organisation: string;
  year: number;
  kind: "FTE" | "REVENUE" | "KM" | "OTHER";
  label: string;
  value: number;
  footprintType: "Heel jaar" | "Half jaar";
};

export function kpiKind(stream: string): WorkbookKpi["kind"] {
  const s = stream.toLowerCase();
  if (/fte|medewerker|personeel/.test(s)) return "FTE";
  if (/omzet/.test(s)) return "REVENUE";
  if (/kilometer|km/.test(s)) return "KM";
  return "OTHER";
}

export function parseDataSheet(rows: Rows) {
  const h = findHeader(rows, ["EMISSIESTROOM", "AANTAL", "JAAR"]);
  if (h < 0) return { consumptions: [], kpis: [], warnings: ["Tabblad Data scope 1&2: kopregel niet gevonden."] };
  const header = rows[h];
  const c = {
    org: colOf(header, "ORGANISATIE"),
    year: colOf(header, "JAAR"),
    type: colOf(header, "TYPE FOOTPRINT"),
    scope: colOf(header, "SCOPE EMISSIES"),
    stream: colOf(header, "EMISSIESTROOM"),
    qty: header.findIndex((x) => norm(str(x)) === "aantal"),
    unit: colOf(header, "EENHEID"),
    source: colOf(header, "BRONGEGEVENS"),
    note: colOf(header, "TOELICHTING"),
    loc: colOf(header, "VESTIGING"),
  };
  const consumptions: WorkbookConsumption[] = [];
  const kpis: WorkbookKpi[] = [];
  const warnings: string[] = [];
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const stream = str(r[c.stream]);
    const year = num(r[c.year]);
    const qty = num(r[c.qty]);
    if (!stream || !year || qty === null) continue;
    const scope = parseScope(r[c.scope]);
    const organisation = str(r[c.org]) || "Onbekend";
    if (scope === "KPI") {
      kpis.push({
        organisation,
        year,
        kind: kpiKind(stream),
        label: stream,
        value: qty,
        footprintType: /half/i.test(str(r[c.type])) ? "Half jaar" : "Heel jaar",
      });
      continue;
    }
    if (scope === null) {
      warnings.push(`Rij ${i + 1}: scope "${str(r[c.scope])}" bij ${stream} niet ondersteund — overgeslagen`);
      continue;
    }
    const type = /half/i.test(str(r[c.type])) ? "Half jaar" : "Heel jaar";
    consumptions.push({
      row: i + 1,
      organisation,
      year,
      footprintType: type,
      scope,
      stream,
      quantity: qty,
      unit: str(r[c.unit]),
      source: c.source >= 0 ? str(r[c.source]) || null : null,
      note: c.note >= 0 ? str(r[c.note]) || null : null,
      location: c.loc >= 0 ? str(r[c.loc]) || null : null,
    });
  }
  return { consumptions, kpis, warnings };
}

/**
 * Welke regels tellen mee? Per organisatie en jaar: de regels "Heel jaar"; zijn die er (nog) niet, dan "Half jaar"
 * als eerste halfjaar. Zo wordt niets dubbel geteld (het dashboard houdt half- en heeljaarcijfers naast elkaar bij).
 */
export function selectConsumptions(list: WorkbookConsumption[]) {
  const hasFull = new Set(list.filter((c) => c.footprintType === "Heel jaar").map((c) => `${c.organisation}|${c.year}`));
  return list
    .filter((c) => c.footprintType === "Heel jaar" || !hasFull.has(`${c.organisation}|${c.year}`))
    .map((c) => ({
      ...c,
      periodStart: `${c.year}-01-01`,
      periodEnd: c.footprintType === "Heel jaar" ? `${c.year}-12-31` : `${c.year}-06-30`,
    }));
}

export type WorkbookDkmp = {
  section: string;
  stream: string;
  unit: string | null;
  source: string | null;
  dataOwner: string | null;
  executor: string | null;
  requestPeriod: string | null;
  analysisPeriod: string | null;
  deviation: string | null;
  uncertainty: string | null;
  improvement: string | null;
};

export function parseDkmpSheet(rows: Rows) {
  const h = findHeader(rows, ["Emissiestroom", "Eenheid", "Bron"]);
  if (h < 0) return { items: [] as WorkbookDkmp[], warnings: ["Tabblad DKMP: kopregel niet gevonden."] };
  const header = rows[h];
  const c = {
    stream: colOf(header, "Emissiestroom"),
    unit: colOf(header, "Eenheid"),
    source: colOf(header, "Bron"),
    owner: colOf(header, "Brondata van"),
    exec: colOf(header, "Uitvoerder"),
    req: colOf(header, "Datum uitvraag"),
    an: colOf(header, "Datum analyse"),
    dev: colOf(header, "Afwijking"),
    unc: colOf(header, "Onzekerheden"),
    imp: colOf(header, "Verbeterplan"),
  };
  const last = Math.max(...Object.values(c));
  const items: WorkbookDkmp[] = [];
  let section = "Algemeen";
  let sectionUnit: string | null = null;
  const seen = new Set<string>();
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const stream = str(r[c.stream]);
    if (!stream) continue;
    const rest = [c.unit, c.source, c.owner, c.exec, c.req, c.an, c.dev, c.unc, c.imp].map((x) => str(r[x]));
    if (rest.every((x) => !x)) {
      section = stream;
      sectionUnit = null;
      continue;
    }
    const unit = str(r[c.unit]) || sectionUnit;
    if (str(r[c.unit])) sectionUnit = str(r[c.unit]);
    const key = `${section}|${stream}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const v = (x: number) => (x >= 0 && x <= last ? str(r[x]) || null : null);
    items.push({
      section,
      stream,
      unit,
      source: v(c.source),
      dataOwner: v(c.owner),
      executor: v(c.exec),
      requestPeriod: v(c.req),
      analysisPeriod: v(c.an),
      deviation: v(c.dev),
      uncertainty: v(c.unc),
      improvement: v(c.imp),
    });
  }
  return { items, warnings: [] as string[] };
}

export type WorkbookMeasure = {
  streamGroup: string;
  title: string;
  description: string | null;
  deadline: string | null; // jaar of datum als tekst
  planning: string | null;
  skao: string | null;
  skaoCategory: string | null;
  term: string | null;
  owner: string | null;
  knowledgeNeed: string | null;
  progressNote: string | null;
  trl: string | null;
  flexibilityImpact: string | null;
  investment: string | null;
  legislation: string | null;
  resources: string | null;
  valueChain: string | null;
  currentYearActions: string | null;
  tenderAdvantage: string | null;
  notApplicableReason: string | null;
  measureType: string | null;
  reductionPct: number | null; // uit het PVA-tabblad (fractie × 100)
  energyReductionPct: number | null;
  indication: string | null;
  sortOrder: number; // volgorde in het plan van aanpak
};

/**
 * Onderdelen onder "Energiebeoordeling" in het plan van aanpak. Maatregelen daaronder (bijv. bij "Verbetering
 * van inzicht") worden ook ingelezen, met het onderdeel als groep.
 */
export const PVA_SECTIONS = PLAN_SECTIONS;
const SECTION_RE =
  /^(maatregelen opgenomen|kansrijke maatregelen|verbetering van inzicht|overige \(organisatorische\)|bevindingen uit de directie|bevindingen uit de externe)/i;
const STOP = /^optelsom/i;

/** Naam van een onderdeel zoals in PVA_SECTIONS (de tekst in het bestand kan iets afwijken). */
export function sectionName(text: string): string {
  const t = norm(text);
  const key: [RegExp, (typeof PVA_SECTIONS)[number]][] = [
    [/^maatregelen opgenomen/, PVA_SECTIONS[0]],
    [/^kansrijke maatregelen/, PVA_SECTIONS[1]],
    [/^verbetering van inzicht/, PVA_SECTIONS[2]],
    [/^bevindingen uit de directie/, PVA_SECTIONS[3]],
    [/^bevindingen uit de externe audit/, PVA_SECTIONS[4]],
  ];
  return key.find(([re]) => re.test(t))?.[1] ?? text.replace(/\s+/g, " ").trim().slice(0, 120);
}

export type PvaDocument = {
  /** Tekst bij "Energiebeoordeling" (welke maatregelen wel/niet zijn opgenomen). */
  intro: string | null;
  /** Onderdelen met eventuele losse tekstregels (zonder maatregelkolommen). */
  sections: { title: string; text: string | null }[];
};

export function parsePlanSheet(rows: Rows) {
  const h = findHeader(rows, ["Maatregelen", "Deadline"]);
  if (h < 0)
    return {
      measures: [] as WorkbookMeasure[],
      doc: { intro: null, sections: [] } as PvaDocument,
      warnings: ["Tabblad Plan van aanpak: kopregel niet gevonden."],
    };
  const header = rows[h];
  const col = (n: string) => colOf(header, n);
  const c = {
    type: col("Type maatregel"),
    title: col("Maatregelen"),
    desc: col("Toelichting maatregel"),
    deadline: col("Deadline"),
    planning: col("Planning"),
    skao: col("SKAO/eigen"),
    cat: col("Indien SKAO"),
    term: col("Termijn"),
    owner: col("Verantwoordelijke"),
    know: col("Kennisbehoefte"),
    prog: col("Voortgang"),
    trl: col("TRL"),
    flex: col("flexibiliteit"),
    inv: col("Investering"),
    law: col("Wetgeving"),
    res: col("Benodigde middelen"),
    chain: col("waardeketen"),
    act: col("Actiepunten"),
    tender: col("gunningvoordeel"),
    na: col("Onderbouwing"),
  };
  const v = (r: Cell[], i: number) => (i >= 0 ? str(r[i]) || null : null);
  const measures: WorkbookMeasure[] = [];
  const doc: PvaDocument = { intro: null, sections: [] };
  let group = "Overig";
  let inAssessment = false;
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const title = str(r[c.title]);
    if (!title) continue;
    if (STOP.test(title)) break;
    const others = Object.entries(c)
      .filter(([k]) => k !== "title" && k !== "term")
      .some(([, idx]) => idx >= 0 && str(r[idx]) && !/^#ref/i.test(str(r[idx])));
    if (/^energiebeoordeling/i.test(title)) {
      inAssessment = true;
      doc.intro = title.replace(/^energiebeoordeling\s*/i, "").trim() || null;
      continue;
    }
    if (SECTION_RE.test(title) && !others) {
      inAssessment = true;
      group = sectionName(title);
      doc.sections.push({ title: group, text: null });
      continue;
    }
    if (!inAssessment && /^scope\s*\d|^zakelijk|^scope 3/i.test(title) && !others) {
      group = title;
      continue;
    }
    if (/^aan fte|^#ref/i.test(title)) continue;
    if (inAssessment && !others) {
      // Losse tekst in een onderdeel van de energiebeoordeling.
      const sec = doc.sections[doc.sections.length - 1];
      if (sec) sec.text = [sec.text, title].filter(Boolean).join("\n");
      continue;
    }
    measures.push({
      streamGroup: group,
      title: title.slice(0, 300),
      description: v(r, c.desc),
      deadline: v(r, c.deadline),
      planning: v(r, c.planning),
      skao: v(r, c.skao),
      skaoCategory: v(r, c.cat),
      term: v(r, c.term),
      owner: v(r, c.owner),
      knowledgeNeed: v(r, c.know),
      progressNote: v(r, c.prog),
      trl: v(r, c.trl),
      flexibilityImpact: v(r, c.flex),
      investment: v(r, c.inv),
      legislation: v(r, c.law),
      resources: v(r, c.res),
      valueChain: v(r, c.chain),
      currentYearActions: v(r, c.act),
      tenderAdvantage: v(r, c.tender),
      notApplicableReason: v(r, c.na),
      measureType: v(r, c.type),
      reductionPct: null,
      energyReductionPct: null,
      indication: null,
      sortOrder: measures.length + 1,
    });
  }
  return { measures: measures.filter((m) => !/^#/.test(m.title)), doc, warnings: [] as string[] };
}

export type PvaScope = {
  scope: 1 | 2 | 3;
  totalCo2Pct: number | null;
  totalGjPct: number | null;
  potentialCo2Pct: number | null;
  potentialGjPct: number | null;
};
export type PvaMilestone = {
  year: number;
  scope1: number | null;
  scope2: number | null;
  scope3: number | null;
  total: number | null;
  lastTarget: number | null;
  energy: number | null;
};
export type PvaTarget = {
  organisation: string | null;
  lastTargetYear: number | null;
  baseYear: number | null;
  targetYear: number | null;
  emissionType: string | null;
  textAll: string | null; // doelstelling scope 1, 2 & 3
  text12: string | null; // doelstelling scope 1 & 2
  totalCo2Pct: number | null;
  totalGjPct: number | null;
  scopes: PvaScope[];
  milestones: PvaMilestone[];
};

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Percentage uit een cel: fractie (0,176) → 17,6; "0" en tekst → null of 0. */
const pctOf = (v: Cell): number | null => {
  const n = num(v);
  return n === null ? null : Math.round(n * 100 * 10000) / 10000;
};

/** Reductiepercentages per maatregel en de doelstelling (gesplitst per scope) uit "PVA - berekening doelstelling". */
export function parsePvaSheet(rows: Rows) {
  const out = new Map<string, { reductionPct: number | null; energyReductionPct: number | null; indication: string | null }>();
  const target: PvaTarget = {
    organisation: null,
    lastTargetYear: null,
    baseYear: null,
    targetYear: null,
    emissionType: null,
    textAll: null,
    text12: null,
    totalCo2Pct: null,
    totalGjPct: null,
    scopes: [],
    milestones: [],
  };
  let block: "none" | "goals" | "potential" | "milestones" | "measures" | "texts" = "none";
  let pendingText: "all" | "12" | null = null;
  for (const r of rows) {
    const label = str(r?.[2]);
    if (!label) continue;
    if (/^organisatie$/i.test(label)) target.organisation = str(r[3]) || null;
    else if (/^laatst opgestelde doelstelling/i.test(label)) target.lastTargetYear = num(r[3]);
    else if (/^basis jaar/i.test(label)) target.baseYear = num(r[3]);
    else if (/^doel jaar/i.test(label)) target.targetYear = num(r[3]);
    else if (/^type uitstoot/i.test(label)) target.emissionType = str(r[3]) || null;
    else if (/^doelstelling scope 1, 2 (&|en) 3/i.test(label)) pendingText = "all";
    else if (/^doelstelling scope 1 (&|en) 2/i.test(label)) pendingText = "12";
    else if (pendingText && /heeft het doel/i.test(label)) {
      if (pendingText === "all") target.textAll = label;
      else target.text12 = label;
      pendingText = null;
    } else if (/^reductiedoelstellingen/i.test(label)) block = "goals";
    else if (/^reductiepotentieel per scope/i.test(label)) block = "potential";
    else if (/^tussendoelstellingen/i.test(label)) block = "milestones";
    else if (/^maatregelen /i.test(label)) block = "measures";
    else if (/^totaal op/i.test(label)) block = "none";
    else if (block === "goals" && /^scope [123]$/i.test(label)) {
      const scope = Number(label.slice(-1)) as 1 | 2 | 3;
      const cur = target.scopes.find((x) => x.scope === scope) ?? { scope, totalCo2Pct: null, totalGjPct: null, potentialCo2Pct: null, potentialGjPct: null };
      cur.totalCo2Pct = pctOf(r[3]);
      cur.totalGjPct = pctOf(r[4]);
      if (!target.scopes.includes(cur)) target.scopes.push(cur);
    } else if (block === "goals" && /^totaal$/i.test(label)) {
      target.totalCo2Pct = pctOf(r[3]);
      target.totalGjPct = pctOf(r[4]);
      block = "none";
    } else if (block === "potential" && /^scope [123]$/i.test(label)) {
      const scope = Number(label.slice(-1)) as 1 | 2 | 3;
      const cur = target.scopes.find((x) => x.scope === scope) ?? { scope, totalCo2Pct: null, totalGjPct: null, potentialCo2Pct: null, potentialGjPct: null };
      cur.potentialCo2Pct = pctOf(r[3]);
      cur.potentialGjPct = pctOf(r[5]);
      if (!target.scopes.includes(cur)) target.scopes.push(cur);
      if (scope === 3) block = "none";
    } else if (block === "milestones" && /^20\d{2}$/.test(label)) {
      const year = Number(label);
      if (!target.milestones.some((m) => m.year === year))
        target.milestones.push({
          year,
          scope1: pctOf(r[3]),
          scope2: pctOf(r[4]),
          scope3: pctOf(r[5]),
          total: pctOf(r[6]),
          lastTarget: pctOf(r[7]),
          energy: pctOf(r[8]),
        });
    } else if (/^scope [123]$/i.test(label)) block = "none";
    else if (block === "measures" && label !== "0" && !/^#ref/i.test(label)) {
      const d = num(r[3]);
      const f = num(r[5]);
      const ind = str(r[7]);
      if (d !== null || f !== null || ind)
        out.set(norm(label), {
          reductionPct: d === null ? null : round6(d * 100),
          energyReductionPct: f === null ? null : round6(f * 100),
          indication: ind || null,
        });
    }
  }
  target.milestones = target.milestones.filter((m) => [m.scope1, m.scope2, m.scope3, m.total, m.lastTarget, m.energy].some((x) => x !== null && x !== 0));
  return { reductions: out, baseYear: target.baseYear, targetYear: target.targetYear, targetText: target.textAll ?? target.text12, target };
}

/** Maatregelen uit het plan van aanpak aanvullen met de percentages uit de PVA-berekening (op naam). */
export function mergePva(measures: WorkbookMeasure[], pva: ReturnType<typeof parsePvaSheet>): WorkbookMeasure[] {
  return measures.map((m) => {
    const hit = pva.reductions.get(norm(m.title));
    return hit ? { ...m, reductionPct: hit.reductionPct, energyReductionPct: hit.energyReductionPct, indication: hit.indication } : m;
  });
}

/** Per organisatie, jaar en soort één kengetal: "Heel jaar" gaat voor "Half jaar"; bij meerdere de laatste. */
export function selectKpis(list: WorkbookKpi[]) {
  const map = new Map<string, WorkbookKpi>();
  for (const k of list) {
    const key = `${k.organisation}|${k.year}|${k.kind}`;
    const cur = map.get(key);
    if (!cur || (cur.footprintType === "Half jaar" && k.footprintType === "Heel jaar") || cur.footprintType === k.footprintType) map.set(key, k);
  }
  return [...map.values()];
}

/** Dubbele titels in het plan van aanpak krijgen een volgnummer (bijv. twee keer "Controle bandenspanning"). */
export function uniqueTitles(list: WorkbookMeasure[]): WorkbookMeasure[] {
  const seen = new Map<string, number>();
  return list.map((m) => {
    const k = norm(m.title);
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return n > 1 ? { ...m, title: `${m.title.slice(0, 290)} (${n})` } : m;
  });
}

/** Alle onderdelen van de werkmap in één keer (tabbladnaam → rijen). */
export function parseCo2Workbook(sheets: Record<string, Rows>) {
  const find = (re: RegExp) => Object.entries(sheets).find(([name]) => re.test(name))?.[1];
  const factorRows = find(/scope\s*1\s*&\s*2\s*input/i);
  const dataRows = find(/^data scope\s*1\s*&\s*2/i);
  const dkmpRows = find(/^dkmp$/i);
  const planRows = find(/^plan van aanpak$/i);
  const pvaRows = find(/^pva/i);
  const factorPart = factorRows ? parseFactorSheet(factorRows) : null;
  const dataPart = dataRows ? parseDataSheet(dataRows) : null;
  const dkmpPart = dkmpRows ? parseDkmpSheet(dkmpRows) : null;
  const planPart = planRows ? parsePlanSheet(planRows) : null;
  const pvaPart = pvaRows ? parsePvaSheet(pvaRows) : null;
  return {
    factors: factorPart,
    data: dataPart,
    selected: dataPart ? selectConsumptions(dataPart.consumptions) : [],
    dkmp: dkmpPart,
    kpis: dataPart ? selectKpis(dataPart.kpis) : [],
    measures: planPart ? uniqueTitles(pvaPart ? mergePva(planPart.measures, pvaPart) : planPart.measures) : [],
    pva: pvaPart ? { baseYear: pvaPart.baseYear, targetYear: pvaPart.targetYear, targetText: pvaPart.targetText, target: pvaPart.target } : null,
    pvaDoc: planPart?.doc ?? null,
    missing: [!factorRows && "Scope 1&2 Input keuzevariabelen", !dataRows && "Data scope 1&2", !dkmpRows && "DKMP", !planRows && "Plan van aanpak"].filter(
      Boolean,
    ) as string[],
  };
}
