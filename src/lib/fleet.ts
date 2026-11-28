import { normText, type ImportField } from "@/lib/spreadsheet-import";

/**
 * Wagenpark (CO2-prestatieladder): samenstelling per jaar naar brandstoftype (figuur V3) en naar
 * milieuclassificatie / Euroklasse (figuur V1). Bron per jaar: ingevoerde of geplakte jaartabellen (FleetCount),
 * anders berekend uit het voertuigenregister (Equipment met soort, brandstof, Euroklasse en in/uit dienst).
 */

export const VEHICLE_TYPES = [
  { key: "TRUCK", label: "Vrachtwagens" },
  { key: "VAN", label: "Bestelwagens / busjes" },
  { key: "CAR", label: "Personenauto's" },
  { key: "MACHINE", label: "Materieel (shovels, kranen, …)" },
  { key: "OTHER", label: "Overig" },
] as const;
export const FUEL_TYPES = [
  { key: "ELECTRIC", label: "Elektriciteit", zeroEmission: true },
  { key: "HYDROGEN", label: "Waterstof", zeroEmission: true },
  { key: "HYBRID", label: "Hybride", zeroEmission: false },
  { key: "HVO", label: "HVO", zeroEmission: false },
  { key: "GAS", label: "LNG / CNG / LPG", zeroEmission: false },
  { key: "PETROL", label: "Benzine", zeroEmission: false },
  { key: "DIESEL", label: "Diesel", zeroEmission: false },
  { key: "OTHER", label: "Overig", zeroEmission: false },
] as const;
/** Milieuclassificatie in de volgorde van figuur V1: elektrisch, Euro 6 … Euro 0. */
export const EURO_CLASSES = [
  { key: "ELECTRIC", label: "Elektrisch", zeroEmission: true },
  { key: "EURO6", label: "6", zeroEmission: false },
  { key: "EURO5", label: "5", zeroEmission: false },
  { key: "EURO4", label: "4", zeroEmission: false },
  { key: "EURO3", label: "3", zeroEmission: false },
  { key: "EURO2", label: "2", zeroEmission: false },
  { key: "EURO1", label: "1", zeroEmission: false },
  { key: "EURO0", label: "0", zeroEmission: false },
] as const;

export type FleetKind = "FUEL" | "EURO";
export type VehicleType = (typeof VEHICLE_TYPES)[number]["key"];
export const vehicleLabel = (k: string) => VEHICLE_TYPES.find((v) => v.key === k)?.label ?? k;
export const fuelLabel = (k: string) => FUEL_TYPES.find((f) => f.key === k)?.label ?? k;
export const euroLabel = (k: string) =>
  k === "ELECTRIC" ? "Elektrisch" : EURO_CLASSES.find((e) => e.key === k)?.label ? `Euro ${EURO_CLASSES.find((e) => e.key === k)!.label}` : k;
export const categoriesOf = (kind: FleetKind) => (kind === "FUEL" ? FUEL_TYPES : EURO_CLASSES);

// ── Herkennen uit tekst (import, plakken) ─────────────────────

export function parseFuelType(value: unknown): string | null {
  const v = normText(String(value ?? ""));
  if (!v) return null;
  if (/waterstof|hydrogen|h2|fcev/.test(v)) return "HYDROGEN";
  if (/hybride|hybrid|phev|hev/.test(v)) return "HYBRID";
  if (/elektr|electric|\bev\b|bev|zero/.test(v)) return "ELECTRIC";
  if (/hvo/.test(v)) return "HVO";
  if (/lng|cng|lpg|aardgas|gas/.test(v)) return "GAS";
  if (/benzine|petrol|gasoline|euro 95|e10/.test(v)) return "PETROL";
  if (/diesel|gasolie|b7/.test(v)) return "DIESEL";
  if (/overig|anders|other/.test(v)) return "OTHER";
  return null;
}

const ROMAN: Record<string, number> = { "0": 0, i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };
export function parseEuroClass(value: unknown): string | null {
  const v = normText(String(value ?? ""));
  if (!v) return null;
  if (/elektr|electric|\bev\b|zero|emissievrij|waterstof/.test(v)) return "ELECTRIC";
  const d = v.match(/(?:^|\s|euro)([0-6])(?!\d)/);
  const r = v.match(/\b(vi|v|iv|iii|ii|i)\b/);
  const n = d ? Number(d[1]) : r ? ROMAN[r[1]] : undefined;
  return n === undefined || n > 6 ? null : `EURO${n}`;
}

export function parseVehicleType(value: unknown): VehicleType | null {
  const v = normText(String(value ?? ""));
  if (!v) return null;
  if (/vracht|truck|trekker|kipper|mixer|kraakpers|containerwagen|portaal|tankwagen|n3|n2/.test(v)) return "TRUCK";
  if (/bestel|bus|van|n1/.test(v)) return "VAN";
  if (/personen|auto|car|m1|lease/.test(v)) return "CAR";
  if (/shovel|kraan|graaf|machine|materieel|heftruck|dumper|wals|aggregaat|minigraver/.test(v)) return "MACHINE";
  return "OTHER";
}

// ── Tellen ────────────────────────────────────────────────────

export type ManualCount = { year: number; vehicleType: string; kind: string; value: string; count: number };
export type RegisterVehicle = {
  vehicleType: string | null;
  fuelType: string | null;
  euroClass: string | null;
  inServiceFrom: Date | null;
  inServiceUntil: Date | null;
  active: boolean;
};

/** Peildatum van een jaar: 31 december, of vandaag voor het lopende jaar. */
export function referenceDate(year: number, now = new Date()): Date {
  return year >= now.getUTCFullYear() ? now : new Date(Date.UTC(year, 11, 31));
}

/** Was het voertuig op de peildatum in gebruik? Zonder 'in dienst'-datum: altijd al; zonder 'uit dienst': nog in gebruik (tenzij niet actief). */
export function inService(v: RegisterVehicle, ref: Date, now = new Date()): boolean {
  if (v.inServiceFrom && v.inServiceFrom > ref) return false;
  if (v.inServiceUntil && v.inServiceUntil < ref) return false;
  if (!v.inServiceUntil && !v.active && ref >= new Date(Date.UTC(now.getUTCFullYear(), 0, 1))) return false;
  return true;
}

export type FleetSource = "manual" | "register" | "mixed" | "none";
export type FleetSeries = {
  kind: FleetKind;
  years: number[];
  categories: readonly { key: string; label: string; zeroEmission: boolean }[];
  value: (cat: string, year: number) => number;
  total: (year: number) => number;
  zeroPct: (year: number) => number;
  source: (year: number) => FleetSource;
  unknown: (year: number) => number; // voertuigen in het register zonder brandstof/klasse
};

/**
 * Aantallen per categorie per jaar voor één soort (of alle voertuigen).
 * Per soort voertuig en jaar gaan ingevoerde aantallen voor; anders telt de app het register op de peildatum.
 * Het register telt tot en met het laatste volledige jaar (zoals de figuren in de CO2-rapportage); het lopende
 * jaar alleen met `includeCurrentYear`.
 */
export function fleetSeries(
  kind: FleetKind,
  manual: ManualCount[],
  vehicles: RegisterVehicle[],
  vehicleType?: string,
  now = new Date(),
  includeCurrentYear = false,
): FleetSeries {
  const cats = categoriesOf(kind);
  const man = manual.filter((m) => m.kind === kind && (!vehicleType || m.vehicleType === vehicleType));
  const veh = vehicles.filter((v) => v.vehicleType && (!vehicleType || v.vehicleType === vehicleType));
  const lastYear = now.getUTCFullYear() - (includeCurrentYear ? 0 : 1);
  const firstRegisterYear = veh.length ? Math.min(lastYear, ...veh.map((v) => (v.inServiceFrom ? v.inServiceFrom.getUTCFullYear() : lastYear))) : null;
  const years = new Set(man.map((m) => m.year));
  if (firstRegisterYear !== null) for (let y = firstRegisterYear; y <= lastYear; y++) years.add(y);
  const sorted = [...years].sort((a, b) => a - b);
  const manualKey = new Set(man.map((m) => `${m.vehicleType}|${m.year}`));
  const types = [...new Set([...man.map((m) => m.vehicleType), ...veh.map((v) => v.vehicleType!)])];
  const field = kind === "FUEL" ? "fuelType" : "euroClass";
  const cache = new Map<number, { counts: Map<string, number>; manual: number; register: number }>();
  const countsFor = (year: number) => {
    if (cache.has(year)) return cache.get(year)!;
    const counts = new Map<string, number>();
    let manualTypes = 0;
    let registerTypes = 0;
    const ref = referenceDate(year, now);
    for (const t of types) {
      if (manualKey.has(`${t}|${year}`)) {
        manualTypes++;
        for (const r of man.filter((x) => x.year === year && x.vehicleType === t)) counts.set(r.value, (counts.get(r.value) ?? 0) + r.count);
      } else if (firstRegisterYear !== null && year >= firstRegisterYear) {
        const list = veh.filter((x) => x.vehicleType === t && inService(x, ref, now));
        if (list.length) registerTypes++;
        for (const v of list) {
          const key = v[field] ?? "__unknown";
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
    }
    const res = { counts, manual: manualTypes, register: registerTypes };
    cache.set(year, res);
    return res;
  };
  const value = (cat: string, year: number) => countsFor(year).counts.get(cat) ?? 0;
  const total = (year: number) => [...countsFor(year).counts.values()].reduce((n, x) => n + x, 0);
  const zero = (year: number) => cats.filter((c) => c.zeroEmission).reduce((n, c) => n + value(c.key, year), 0);
  return {
    kind,
    years: sorted,
    categories: cats.filter((c) => sorted.some((y) => value(c.key, y) > 0)),
    value,
    total,
    zeroPct: (y) => (total(y) ? (zero(y) / total(y)) * 100 : 0),
    source: (y) => {
      const c = countsFor(y);
      return c.manual && c.register ? "mixed" : c.manual ? "manual" : c.register ? "register" : "none";
    },
    unknown: (y) => countsFor(y).counts.get("__unknown") ?? 0,
  };
}

// ── Plakken uit Excel (jaartabel) ─────────────────────────────

export type PastedTable = { years: number[]; rows: { key: string; label: string; values: (number | null)[] }[]; unknown: string[] };

/**
 * Tabel uit Excel (tab- of puntkomma-gescheiden), zoals de gegevens achter figuur V1/V3:
 * kopregel met jaren en per regel een klasse/brandstof, of andersom (jaren als regels). "Totaal" wordt overgeslagen.
 */
export function parsePastedTable(text: string, kind: FleetKind): PastedTable {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.split(/\t|;/).map((c) => c.trim()))
    .filter((cells) => cells.some((c) => c));
  const isYear = (c: string) => /^(19|20)\d{2}$/.test(c);
  const parse = kind === "FUEL" ? parseFuelType : parseEuroClass;
  const toNum = (c: string) => {
    if (!c) return null;
    const n = Number(c.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? Math.round(n) : null;
  };
  let grid = lines;
  const headerIdx = grid.findIndex((cells) => cells.filter(isYear).length >= 1 && cells.filter(isYear).length >= cells.filter((c) => c).length - 1);
  // Jaren in de eerste kolom → transponeren.
  if (headerIdx < 0 && grid.filter((cells) => isYear(cells[0] ?? "")).length >= 1) {
    const width = Math.max(...grid.map((r) => r.length));
    grid = Array.from({ length: width }, (_, c) => grid.map((r) => r[c] ?? ""));
  }
  const h = grid.findIndex((cells) => cells.filter(isYear).length >= 1);
  if (h < 0) return { years: [], rows: [], unknown: [] };
  const header = grid[h];
  const yearCols = header.map((c, i) => (isYear(c) ? i : -1)).filter((i) => i >= 0);
  const years = yearCols.map((i) => Number(header[i]));
  const rows: PastedTable["rows"] = [];
  const unknown: string[] = [];
  for (const cells of grid.slice(h + 1)) {
    const label = cells.find((c, i) => c && !yearCols.includes(i)) ?? "";
    if (!label || /^totaal|^total|^som/i.test(label)) continue;
    const key = parse(label);
    if (!key) {
      unknown.push(label);
      continue;
    }
    const values = yearCols.map((i) => toNum(cells[i] ?? ""));
    const existing = rows.find((r) => r.key === key);
    if (existing) existing.values = existing.values.map((v, i) => (v ?? 0) + (values[i] ?? 0));
    else rows.push({ key, label, values });
  }
  return { years, rows, unknown };
}

// ── Import voertuigenregister ─────────────────────────────────

export const VEHICLE_IMPORT_FIELDS: ImportField[] = [
  { key: "code", label: "Kenteken / machinenummer", required: true, hints: ["kenteken", "machinenummer", "nummer", "registratie", "license"] },
  { key: "name", label: "Omschrijving / naam", hints: ["omschrijving", "naam", "voertuig", "object"] },
  { key: "vehicleType", label: "Soort voertuig", hints: ["soort", "categorie", "voertuigsoort", "type voertuig", "voertuigcategorie"] },
  { key: "brand", label: "Merk", hints: ["merk", "fabrikant", "make"] },
  { key: "model", label: "Type / model", hints: ["model", "type", "uitvoering"] },
  { key: "fuelType", label: "Brandstof", hints: ["brandstof", "brandstoftype", "fuel", "aandrijving"] },
  { key: "euroClass", label: "Euroklasse / milieuklasse", hints: ["euroklasse", "milieuklasse", "emissieklasse", "euro", "milieuclassificatie", "euronorm"] },
  { key: "buildYear", label: "Bouwjaar", kind: "int", hints: ["bouwjaar", "jaar", "year"] },
  {
    key: "inServiceFrom",
    label: "In dienst (datum)",
    kind: "date",
    hints: ["in dienst", "datum in dienst", "ingebruikname", "aanschaf", "datum aanschaf", "datum eerste toelating"],
  },
  { key: "inServiceUntil", label: "Uit dienst (datum)", kind: "date", hints: ["uit dienst", "datum uit dienst", "verkocht", "afgevoerd", "einddatum"] },
  { key: "discipline", label: "Bedrijfsonderdeel", hints: ["bedrijfsonderdeel", "bu", "afdeling", "discipline"] },
  { key: "location", label: "Vestiging", hints: ["vestiging", "locatie", "standplaats"] },
];
