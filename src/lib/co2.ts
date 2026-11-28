/**
 * CO2-prestatieladder: berekening van de footprint (pure functies, getest).
 *
 * - Emissie = verbruik × emissiefactor (kg CO2e per eenheid). Gebruikt wordt de factor die gold
 *   op de begindatum van het verbruik binnen de rapportageperiode (meest recente `validFrom` ≤ die datum);
 *   een verbruik dat over de jaargrens loopt krijgt zo voor het deel in het nieuwe jaar de factor van dat jaar.
 * - Een verbruik dat over meerdere rapportageperiodes loopt, wordt naar rato van het aantal dagen toegerekend.
 * - Periodes zijn inclusief: begin t/m eind (datums in UTC, 00:00).
 */
const DAY = 86_400_000;

export type FactorRow = { carrierId: string; factor: number; validFrom: Date };
export type ConsumptionInput = {
  id: string;
  carrierId: string;
  quantity: number;
  periodStart: Date;
  periodEnd: Date;
  scope: number | null;
  carrierScope: number;
};
export type PeriodPart = "jaar" | "H1" | "H2" | "Q1" | "Q2" | "Q3" | "Q4";
export const PERIOD_PARTS: { value: PeriodPart; label: string }[] = [
  { value: "jaar", label: "Heel jaar" },
  { value: "H1", label: "1e halfjaar" },
  { value: "H2", label: "2e halfjaar" },
  { value: "Q1", label: "Kwartaal 1" },
  { value: "Q2", label: "Kwartaal 2" },
  { value: "Q3", label: "Kwartaal 3" },
  { value: "Q4", label: "Kwartaal 4" },
];

/** Rapportageperiode: begin (inclusief) en eind (exclusief). */
export function periodRange(year: number, part: PeriodPart = "jaar"): { start: Date; end: Date; label: string } {
  const [m0, m1] =
    part === "H1"
      ? [0, 6]
      : part === "H2"
        ? [6, 12]
        : part === "Q1"
          ? [0, 3]
          : part === "Q2"
            ? [3, 6]
            : part === "Q3"
              ? [6, 9]
              : part === "Q4"
                ? [9, 12]
                : [0, 12];
  const label = part === "jaar" ? String(year) : part.startsWith("H") ? `${part === "H1" ? "1e" : "2e"} halfjaar ${year}` : `${part} ${year}`;
  return { start: new Date(Date.UTC(year, m0, 1)), end: new Date(Date.UTC(year, m1, 1)), label };
}

/** Deel van een verbruiksperiode (inclusief eind) dat binnen [start, end) valt. */
export function overlapFraction(cStart: Date, cEnd: Date, start: Date, end: Date): number {
  const cEndExcl = cEnd.getTime() + DAY;
  const total = (cEndExcl - cStart.getTime()) / DAY;
  if (total <= 0) return 0;
  const overlap = (Math.min(cEndExcl, end.getTime()) - Math.max(cStart.getTime(), start.getTime())) / DAY;
  return Math.max(0, Math.min(1, overlap / total));
}

/** Maanden (0–11, of jjjj*12+m bij meerdere jaren) van een verbruiksperiode (inclusief eind) die binnen [start, end) vallen. */
export function monthsCovered(cStart: Date, cEnd: Date, start: Date, end: Date): number[] {
  const from = Math.max(cStart.getTime(), start.getTime());
  const to = Math.min(cEnd.getTime(), end.getTime() - DAY);
  if (to < from) return [];
  const out: number[] = [];
  const a = new Date(from);
  const b = new Date(to);
  for (
    let y = a.getUTCFullYear(), m = a.getUTCMonth();
    y < b.getUTCFullYear() || (y === b.getUTCFullYear() && m <= b.getUTCMonth());
    m === 11 ? ((m = 0), y++) : m++
  )
    out.push(y * 12 + m);
  return out;
}

/** Geldende factor voor een energiedrager op een datum; `null` als er (nog) geen factor is. */
export function factorAt(factors: FactorRow[], carrierId: string, date: Date): FactorRow | null {
  let best: FactorRow | null = null;
  for (const f of factors) {
    if (f.carrierId !== carrierId || f.validFrom.getTime() > date.getTime()) continue;
    if (!best || f.validFrom.getTime() > best.validFrom.getTime()) best = f;
  }
  return best;
}

export type FootprintRow = { id: string; carrierId: string; scope: 1 | 2 | 3; quantity: number; kg: number | null; factor: number | null };

/** Footprint over een periode: totaal, per scope en per verbruiksregel (naar rato toegerekend). */
export function computeFootprint(consumptions: ConsumptionInput[], factors: FactorRow[], range: { start: Date; end: Date }) {
  const rows: FootprintRow[] = [];
  const byScope = { 1: 0, 2: 0, 3: 0 } as Record<1 | 2 | 3, number>;
  let missingFactor = 0;
  for (const c of consumptions) {
    const frac = overlapFraction(c.periodStart, c.periodEnd, range.start, range.end);
    if (frac <= 0) continue;
    const scope = clampScope(c.scope ?? c.carrierScope);
    const quantity = c.quantity * frac;
    const f = factorAt(factors, c.carrierId, factorDate(c.periodStart, range.start));
    const kg = f ? quantity * f.factor : null;
    if (kg === null) missingFactor++;
    else byScope[scope] += kg;
    rows.push({ id: c.id, carrierId: c.carrierId, scope, quantity, kg, factor: f?.factor ?? null });
  }
  return { rows, byScope, totalKg: byScope[1] + byScope[2] + byScope[3], missingFactor };
}

/** Datum waarop de factor wordt bepaald: begin van het verbruik, of het begin van de rapportageperiode als dat later is. */
export function factorDate(consumptionStart: Date, rangeStart: Date): Date {
  return consumptionStart.getTime() > rangeStart.getTime() ? consumptionStart : rangeStart;
}

function clampScope(n: number): 1 | 2 | 3 {
  return n === 2 ? 2 : n === 3 ? 3 : 1;
}

/** Som van kg per sleutel (bijv. per energiedrager of discipline), aflopend gesorteerd. */
export function groupKg<T extends FootprintRow>(rows: T[], key: (r: T) => string | null | undefined): { key: string; kg: number; quantity: number }[] {
  const map = new Map<string, { kg: number; quantity: number }>();
  for (const r of rows) {
    const k = key(r) ?? "";
    const cur = map.get(k) ?? { kg: 0, quantity: 0 };
    cur.kg += r.kg ?? 0;
    cur.quantity += r.quantity;
    map.set(k, cur);
  }
  return [...map.entries()].map(([k, v]) => ({ key: k, ...v })).sort((a, b) => b.kg - a.kg);
}

/**
 * Voortgang van een reductiedoelstelling. Het geplande pad loopt lineair van 0 % in het basisjaar
 * naar het doelpercentage in het doeljaar.
 */
export function targetProgress(input: { baseKg: number; currentKg: number; reductionPct: number; baseYear: number; targetYear: number; year: number }) {
  const { baseKg, currentKg, reductionPct, baseYear, targetYear, year } = input;
  const actualPct = baseKg > 0 ? ((baseKg - currentKg) / baseKg) * 100 : 0;
  const t = Math.max(0, Math.min(1, (year - baseYear) / (targetYear - baseYear)));
  const plannedPct = reductionPct * t;
  const allowedKg = baseKg * (1 - plannedPct / 100);
  return { actualPct, plannedPct, allowedKg, onTrack: baseKg > 0 ? currentKg <= allowedKg : null };
}

const nf1 = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 });
const nfQ = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 });

/** kg → "12,3 t" (ton CO2e). */
export function formatTonnes(kg: number): string {
  return `${nf1.format(kg / 1000)} t`;
}
export function formatKg(kg: number): string {
  return `${nf0.format(kg)} kg`;
}
export function formatQuantity(q: number): string {
  return nfQ.format(q);
}

/**
 * Getal uit een cel. Nederlandse notatie: "1.234,5" → 1234,5; "12,5" → 12,5; "1.234" → 1234.
 * Met zowel punt als komma geldt het laatste teken als decimaalteken ("1,234.5" → 1234,5).
 */
export function parseDecimal(value: unknown): { value: number | null; invalid: boolean } {
  if (value === null || value === undefined || String(value).trim() === "") return { value: null, invalid: false };
  if (typeof value === "number") return Number.isFinite(value) ? { value, invalid: false } : { value: null, invalid: true };
  let s = String(value).trim().replace(/\s| /g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? "," : ".";
    const thou = dec === "," ? "." : ",";
    s = s.split(thou).join("").replace(dec, ".");
  } else if (lastComma >= 0) {
    s = s.replace(/,/g, ".");
    if ((s.match(/\./g) ?? []).length > 1) return { value: null, invalid: true };
  } else if (lastDot >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ""); // "1.234" of "12.345.678" = duizendtallen
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return { value: null, invalid: true };
  return { value: Number(s), invalid: false };
}

const MONTHS: Record<string, number> = {
  jan: 1,
  januari: 1,
  feb: 2,
  februari: 2,
  mrt: 3,
  maart: 3,
  mar: 3,
  apr: 4,
  april: 4,
  mei: 5,
  may: 5,
  jun: 6,
  juni: 6,
  jul: 7,
  juli: 7,
  aug: 8,
  augustus: 8,
  sep: 9,
  sept: 9,
  september: 9,
  okt: 10,
  oktober: 10,
  oct: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

/**
 * Periode uit tekst: "2026-03", "03-2026", "maart 2026", "mrt-26", "Q2 2026", "2026 Q2", "H1 2026", "2026-H2", "2026",
 * of een datum (dan één dag). Geeft begin en eind (inclusief) als jjjj-mm-dd, of `null` bij onleesbaar.
 */
export function parsePeriod(value: unknown): { start: string; end: string } | null {
  const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
  const monthRange = (y: number, m: number) => ({ start: iso(y, m, 1), end: iso(y, m + 1, 0) });
  const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
  if (value instanceof Date && !isNaN(value.getTime())) {
    const d = value.toISOString().slice(0, 10);
    return { start: d, end: d };
  }
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!s) return null;
  let m = s.match(/^(\d{4})$/);
  if (m) return { start: iso(+m[1], 1, 1), end: iso(+m[1], 12, 31) };
  m = s.match(/^(?:(\d{4})[\s\-/]*)?([qh])([1-4])(?:[\s\-/]*(\d{4}))?$/);
  if (m && (m[1] || m[4])) {
    const y = Number(m[1] ?? m[4]);
    const n = Number(m[3]);
    if (m[2] === "h" && n <= 2) return { start: iso(y, n === 1 ? 1 : 7, 1), end: iso(y, n === 1 ? 6 : 12, n === 1 ? 30 : 31) };
    if (m[2] === "q") return { start: iso(y, (n - 1) * 3 + 1, 1), end: iso(y, n * 3 + 1, 0) };
    return null;
  }
  m = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return monthRange(+m[1], +m[2]);
  m = s.match(/^(\d{1,2})[-/](\d{4})$/);
  if (m && +m[1] >= 1 && +m[1] <= 12) return monthRange(+m[2], +m[1]);
  m = s.match(/^([a-z]+)\.?[\s\-/']*(\d{2}|\d{4})$/);
  if (m && MONTHS[m[1]]) return monthRange(fullYear(m[2]), MONTHS[m[1]]);
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/) ?? null;
  if (m) {
    const d = iso(+m[1], +m[2], +m[3]);
    return d.startsWith(m[1]) ? { start: d, end: d } : null;
  }
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) {
    const d = iso(+m[3], +m[2], +m[1]);
    return { start: d, end: d };
  }
  return null;
}

const nfFactor = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 4 });
const nfPct = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** Emissiefactor met tot 4 decimalen (bijv. 3,262). */
export function formatFactor(f: number): string {
  return nfFactor.format(f);
}

/** Percentage met één decimaal en decimale komma; met `sign` een + bij positieve waarden. */
export function formatPct(p: number, sign = false): string {
  return `${sign && p > 0 ? "+" : ""}${nfPct.format(p)} %`;
}

const UNIT_SYNONYMS: Record<string, string[]> = {
  liter: ["l", "ltr", "liter", "liters", "litre"],
  m3: ["m3", "m³", "kuub", "nm3", "kubieke meter"],
  kwh: ["kwh", "kilowattuur"],
  km: ["km", "kilometer", "kilometers"],
  kg: ["kg", "kilogram", "kilo"],
  gj: ["gj", "gigajoule"],
};

/** Is de eenheid uit een bestand dezelfde als die van de energiedrager (met gangbare schrijfwijzen)? */
export function unitMatches(given: string, carrierUnit: string): boolean {
  const n = (s: string) => s.trim().toLowerCase().replace(/\.$/, "");
  const canon = (s: string) => Object.entries(UNIT_SYNONYMS).find(([, list]) => list.includes(n(s)))?.[0] ?? n(s);
  return canon(given) === canon(carrierUnit);
}

// ── Handboek 4.0: type uitstoot, groepen en energie ───────────

/** Type uitstoot: well-to-wheel (standaard in het handboek), tank-to-wheel of well-to-tank. */
export type EmissionType = "WTW" | "TTW" | "WTT";
export const EMISSION_TYPE_LABEL: Record<EmissionType, string> = {
  WTW: "Well-to-wheel (WTW)",
  TTW: "Tank-to-wheel (TTW)",
  WTT: "Well-to-tank (WTT)",
};

/** Factor voor een type uitstoot uit de opgeslagen WTW/TTW/WTT; WTW valt terug op TTW + WTT. */
export function factorForType(f: { factor: number; ttw: number | null; wtt: number | null }, type: EmissionType): number | null {
  if (type === "WTW") return f.factor;
  if (type === "TTW") return f.ttw ?? (f.wtt !== null ? f.factor - f.wtt : f.factor);
  return f.wtt ?? (f.ttw !== null ? f.factor - f.ttw : null);
}

/** Scope-label zoals in de CO2-prestatieladder (scope 3 = zakelijk reizen/business travel in de footprint). */
export const SCOPE_NAME: Record<1 | 2 | 3, string> = { 1: "Scope 1", 2: "Scope 2", 3: "Zakelijk reizen" };

/**
 * Groep in het overzicht (zoals tabel M1A van het CO2-dashboard): eigen instelling, anders afgeleid uit de naam.
 * Alle brandstoffen in scope 1 behalve aardgas en bedrijfsmiddelen tellen als wagenpark.
 */
export function carrierGroup(c: { name: string; reportGroup?: string | null; defaultScope: number }): string {
  if (c.reportGroup?.trim()) return c.reportGroup.trim();
  const n = c.name.toLowerCase();
  if (/aardgas|groengas/.test(n)) return "Aardgasverbruik";
  if (/warmte/.test(n)) return "Warmtelevering";
  if (/vlieg/.test(n)) return "Vliegreizen";
  if (/zakelijk|declara|openbaar vervoer|trein/.test(n)) return "Zakelijk vervoer";
  if (/elektri/.test(n)) return /wagen|laad|auto/.test(n) ? "Elektriciteitsverbruik wagenpark" : "Elektriciteitsverbruik vastgoed";
  if (/bedrijfsmiddel|materieel|machine/.test(n)) return "Brandstofverbruik bedrijfsmiddelen";
  if (c.defaultScope === 1) return "Brandstofverbruik wagenpark";
  return c.defaultScope === 2 ? "Overig scope 2" : "Overig";
}

/** Emissiestroom voor het plan van aanpak (zoals de blokken in het PVA-tabblad). */
export const STREAM_GROUPS = [
  "Scope 1 - Aardgasverbruik",
  "Scope 1 - Brandstofverbruik",
  "Scope 2 - Elektriciteitsverbruik",
  "Scope 2 - Warmteverbruik",
  "Zakelijk reizen",
  "Scope 3",
] as const;
export type StreamGroup = (typeof STREAM_GROUPS)[number];

/** Onderdelen van de energiebeoordeling onder het plan van aanpak (zoals in het CO2-dashboard). */
export const PLAN_SECTIONS = [
  "Maatregelen opgenomen in plan van aanpak",
  "Kansrijke maatregelen ter inspiratie",
  "Verbetering van inzicht",
  "Bevindingen uit de directiebeoordeling voorgaande jaren",
  "Bevindingen uit de externe audit voorgaand jaar",
] as const;
/** Alle groepen in het plan van aanpak, in de volgorde van het dashboard. */
export const PLAN_GROUPS = [...STREAM_GROUPS, ...PLAN_SECTIONS] as const;
export const scopeOfGroup = (g: string): 1 | 2 | 3 | null => (/^scope 1/i.test(g) ? 1 : /^scope 2/i.test(g) ? 2 : /^scope 3|^zakelijk/i.test(g) ? 3 : null);

export function streamGroupOf(c: { name: string; reportGroup?: string | null; defaultScope: number }): StreamGroup {
  const g = carrierGroup(c);
  if (g === "Aardgasverbruik") return "Scope 1 - Aardgasverbruik";
  if (g === "Warmtelevering") return "Scope 2 - Warmteverbruik";
  if (g.startsWith("Elektriciteit")) return "Scope 2 - Elektriciteitsverbruik";
  if (g === "Zakelijk vervoer" || g === "Vliegreizen") return "Zakelijk reizen";
  if (c.defaultScope === 1) return "Scope 1 - Brandstofverbruik";
  if (c.defaultScope === 2) return "Scope 2 - Elektriciteitsverbruik";
  return "Scope 3";
}

/** Emissiestroom van een tekst uit het plan van aanpak ("Scope 1 - Brandstofverbruik", "Maatregelen aardgasverbruik"). */
export function parseStreamGroup(text: string | null | undefined): StreamGroup | null {
  const t = (text ?? "").toLowerCase();
  if (!t) return null;
  if (/aardgas|gas/.test(t)) return "Scope 1 - Aardgasverbruik";
  if (/brandstof|diesel|wagenpark|benzine/.test(t)) return "Scope 1 - Brandstofverbruik";
  if (/warmte/.test(t)) return "Scope 2 - Warmteverbruik";
  if (/elektri|stroom/.test(t)) return "Scope 2 - Elektriciteitsverbruik";
  if (/zakelijk|reis|vervoer/.test(t)) return "Zakelijk reizen";
  if (/scope 3/.test(t)) return "Scope 3";
  return null;
}

/** Verwachte reductie van een maatregel: % op de emissiestroom in het basisjaar. */
export function measureReduction(input: { reductionPct: number | null; streamKg: number; totalKg: number }) {
  if (input.reductionPct === null || !Number.isFinite(input.reductionPct)) return null;
  const kg = (input.reductionPct / 100) * input.streamKg;
  return { kg, pctOfTotal: input.totalKg > 0 ? (kg / input.totalKg) * 100 : 0 };
}

/** kg → MWh/GJ-notatie voor de energiebalans. */
const nfGJ = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 });
export function formatGJ(gj: number, unit: "GJ" | "kWh" = "GJ"): string {
  return unit === "GJ" ? `${nfGJ.format(gj)} GJ` : `${nfGJ.format(gj * 277.7777778)} kWh`;
}
