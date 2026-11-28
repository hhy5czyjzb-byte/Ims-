import type { AbsenceClass, ActionSource, InjuryLevel, ReportOrigin, ReportSeverity, ReportStatus, ReportType } from "@prisma/client";
import { normText, type ImportField } from "@/lib/spreadsheet-import";

/** Code van een melding: M-001. */
export function reportCode(number: number): string {
  return `M-${String(number).padStart(3, "0")}`;
}
export function reportDisplayCode(r: { number: number; externalRef?: string | null }): string {
  return r.externalRef || reportCode(r.number);
}

/** Soorten waarvoor een oorzaakanalyse en controle op effectiviteit nodig zijn voordat de melding dicht mag. */
export const NEEDS_ANALYSIS: ReportType[] = ["NONCONFORMITY", "COMPLAINT", "ACCIDENT", "NEAR_MISS", "UNSAFE_SITUATION", "ENVIRONMENTAL_INCIDENT", "DAMAGE"];
export const SAFETY_TYPES: ReportType[] = ["ACCIDENT", "NEAR_MISS", "UNSAFE_SITUATION"];

/**
 * Overzichten van meldingen: gescheiden per groep (eigen lijst, tegels en grafieken).
 * Auditbevindingen horen niet bij de meldingen: die staan bij de audits en (opvolging) in de actielijst.
 */
export type ReportGroupKey = "incidenten" | "klachten" | "afwijkingen" | "verbetering";
export const REPORT_GROUPS: { key: ReportGroupKey; label: string; types: ReportType[]; description: string }[] = [
  {
    key: "incidenten",
    label: "Ongevallen en incidenten",
    types: ["ACCIDENT", "NEAR_MISS", "UNSAFE_SITUATION", "ENVIRONMENTAL_INCIDENT", "DAMAGE"],
    description: "Ongevallen, bijna-ongevallen, onveilige situaties en handelingen, milieu-incidenten en schade (VCA, ISO 14001).",
  },
  {
    key: "klachten",
    label: "Klachten",
    types: ["COMPLAINT"],
    description: "Klachten van klanten, opdrachtgevers, omwonenden en anderen (ISO 9001 §9.1.2, §10.2).",
  },
  {
    key: "afwijkingen",
    label: "Afwijkingen (NC)",
    types: ["NONCONFORMITY"],
    description: "Interne afwijkingen en non-conformiteiten, met oorzaakanalyse en faalkosten (ISO 9001/14001 §10.2).",
  },
  { key: "verbetering", label: "Verbetervoorstellen en overig", types: ["IMPROVEMENT", "OTHER"], description: "Verbetervoorstellen en overige meldingen." },
];
export const DEFAULT_REPORT_GROUP: ReportGroupKey = "incidenten";
export function reportGroup(key: string | undefined): (typeof REPORT_GROUPS)[number] {
  return REPORT_GROUPS.find((g) => g.key === key) ?? REPORT_GROUPS[0];
}
export function groupOfType(type: ReportType): ReportGroupKey {
  return REPORT_GROUPS.find((g) => g.types.includes(type))?.key ?? "verbetering";
}

/** Categorieën van ongevallen (soort voorval), voor registratie en analyse. */
export const ACCIDENT_CATEGORIES = [
  "Val van hoogte",
  "Struikelen, uitglijden of vallen",
  "Geraakt door vallend of bewegend voorwerp",
  "Beknelling",
  "Snij-, steek- of schaafwond",
  "Aanrijding / verkeer",
  "Machine, materieel of gereedschap",
  "Tillen / overbelasting",
  "Gevaarlijke stoffen (incl. asbest, stof)",
  "Brand of explosie",
  "Elektriciteit",
  "Oog- of gehoorletsel",
  "Overig",
] as const;

/** Categorie herkennen uit vrije tekst (import); onbekend blijft als tekst staan. */
export function parseAccidentCategory(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  const v = normText(raw);
  if (!v) return null;
  const rules: [RegExp, (typeof ACCIDENT_CATEGORIES)[number]][] = [
    [/(hoogte|ladder|steiger|dak)/, "Val van hoogte"],
    [/(struikel|uitglij|gevallen|val\b|vallen)/, "Struikelen, uitglijden of vallen"],
    [/(vallend|bewegend|geraakt|getroffen)/, "Geraakt door vallend of bewegend voorwerp"],
    [/(bekneld|beknelling|klem)/, "Beknelling"],
    [/(snij|steek|schaaf|wond)/, "Snij-, steek- of schaafwond"],
    [/(aanrijding|verkeer|botsing|aangereden)/, "Aanrijding / verkeer"],
    [/(machine|materieel|gereedschap|kraan|shovel)/, "Machine, materieel of gereedschap"],
    [/(til|overbelast|rug|sjouw)/, "Tillen / overbelasting"],
    [/(stof|asbest|chemisch|gevaarlijke)/, "Gevaarlijke stoffen (incl. asbest, stof)"],
    [/(brand|explosie|vuur)/, "Brand of explosie"],
    [/(elektr|stroom)/, "Elektriciteit"],
    [/(oog|gehoor)/, "Oog- of gehoorletsel"],
  ];
  for (const [re, cat] of rules) if (re.test(v)) return cat;
  return raw.slice(0, 200);
}

/**
 * Verzuimklasse uit de twee vinkjes en/of het aantal verzuimdagen.
 * Beide vinkjes tegelijk of een vinkje dat niet past bij de dagen geeft een foutmelding.
 */
export function absenceFromInput(short: boolean, long: boolean, lostDays: number | null | undefined): { absence: AbsenceClass | null; error?: string } {
  if (short && long) return { absence: null, error: "Kies óf verzuim 1–15 dagen, óf meer dan 15 dagen (niet allebei)." };
  const days = lostDays ?? null;
  if (short && days !== null && days > 15) return { absence: null, error: `Bij ${days} verzuimdagen hoort 'meer dan 15 dagen'.` };
  if (long && days !== null && days <= 15) return { absence: null, error: `Bij ${days} verzuimdag(en) hoort '1–15 dagen'.` };
  if (short) return { absence: "SHORT" };
  if (long) return { absence: "LONG" };
  if (days !== null && days > 15) return { absence: "LONG" };
  if (days !== null && days >= 1) return { absence: "SHORT" };
  return { absence: null };
}

export function parseAbsence(value: unknown): AbsenceClass | null {
  const v = normText(String(value ?? ""));
  if (!v) return null;
  if (/(meer dan 15|> ?15|langer dan 15|lang)/.test(v)) return "LONG";
  if (/(\b1 ?(t ?m|tot|-| ) ?15\b|kort|<= ?15)/.test(v)) return "SHORT";
  const n = Number(v.replace(/[^0-9]/g, ""));
  if (Number.isInteger(n) && n > 15) return "LONG";
  if (Number.isInteger(n) && n >= 1) return "SHORT";
  return null;
}

/** Bron van een actie die vanuit een melding wordt aangemaakt. */
export function actionSourceForReport(type: ReportType): ActionSource {
  if (type === "COMPLAINT") return "COMPLAINT";
  if (type === "NONCONFORMITY") return "NONCONFORMITY";
  if (type === "IMPROVEMENT" || type === "OTHER") return "OTHER";
  return "INCIDENT";
}

/** Redenen waarom een melding nog niet kan worden afgesloten (leeg = mag). */
export function reportCloseProblems(r: { type: ReportType; rootCause: string | null; effective: boolean | null; actions: { status: string }[] }): string[] {
  const problems: string[] = [];
  const open = r.actions.filter((a) => a.status === "OPEN" || a.status === "IN_PROGRESS").length;
  if (open) problems.push(`Er staan nog ${open} actie(s) open.`);
  if (NEEDS_ANALYSIS.includes(r.type)) {
    if (!r.rootCause?.trim()) problems.push("Leg eerst de oorzaakanalyse vast.");
    if (r.effective === null) problems.push("Leg vast of de maatregelen effectief zijn.");
  }
  return problems;
}

// ── Herkennen bij import ──────────────────────────────────────

export function parseReportType(value: unknown): ReportType | null {
  const v = normText(String(value ?? ""));
  if (!v) return null;
  if (/bijna/.test(v)) return "NEAR_MISS";
  if (/(ongeval|letsel|accident|lti)/.test(v)) return "ACCIDENT";
  if (/(onveilig|gevaarlijke situatie|handeling|unsafe)/.test(v)) return "UNSAFE_SITUATION";
  if (/(milieu|lekkage|morsing|emissie|lozing)/.test(v)) return "ENVIRONMENTAL_INCIDENT";
  if (/(klacht|complaint)/.test(v)) return "COMPLAINT";
  if (/(schade|damage)/.test(v)) return "DAMAGE";
  if (/(verbeter|suggestie|idee|kans)/.test(v)) return "IMPROVEMENT";
  if (/(afwijking|non ?conform|nc\b|^nc|tekortkoming|fout|bevinding|major|minor)/.test(v)) return "NONCONFORMITY";
  return "OTHER";
}

export function parseReportSeverity(value: unknown): ReportSeverity | null {
  const v = normText(String(value ?? ""));
  if (!v) return null;
  if (/(ernstig|zeer hoog|kritiek|severe|major)/.test(v)) return "SEVERE";
  if (/(hoog|high|groot)/.test(v)) return "HIGH";
  if (/(middel|midden|medium|gemiddeld|minor)/.test(v)) return "MEDIUM";
  if (/(laag|low|klein|gering)/.test(v)) return "LOW";
  return null;
}

export function parseInjury(value: unknown): InjuryLevel | null {
  const v = normText(String(value ?? ""));
  if (!v) return null;
  if (/(dodelijk|fatal|overleden)/.test(v)) return "FATAL";
  if (/(blijvend|permanent|invalid)/.test(v)) return "PERMANENT";
  if (/(verzuim|lti|lost time|uitval)/.test(v)) return "LOST_TIME";
  if (/(medisch|huisarts|ziekenhuis|eerste hulp post|seh|mti)/.test(v)) return "MEDICAL";
  if (/(ehbo|first aid|pleister)/.test(v)) return "FIRST_AID";
  if (/(geen|nee|none|n v t)/.test(v)) return "NONE";
  return null;
}

export function parseReportStatus(value: unknown): ReportStatus | null {
  const v = normText(String(value ?? ""));
  if (!v) return null;
  if (/(afgesloten|gesloten|gereed|closed|afgerond|klaar)/.test(v)) return "CLOSED";
  if (/(afgewezen|vervallen|niet terecht|rejected)/.test(v)) return "REJECTED";
  if (/(behandeling|uitvoering|lopend|open actie|progress)/.test(v)) return "IN_PROGRESS";
  if (/(nieuw|open|gemeld|new)/.test(v)) return "NEW";
  return null;
}

export function parseReportOrigin(value: unknown): ReportOrigin | null {
  const v = normText(String(value ?? ""));
  if (!v) return null;
  if (/(klant|opdrachtgever|customer)/.test(v)) return "CUSTOMER";
  if (/(leverancier|onderaannemer|supplier)/.test(v)) return "SUPPLIER";
  if (/(extern.*audit|certific|nck|normec|kiwa)/.test(v)) return "EXTERNAL_AUDIT";
  if (/(gezag|inspectie|gemeente|omgevingsdienst|waterschap)/.test(v)) return "AUTHORITY";
  if (/(omwonend|buren|omgeving)/.test(v)) return "NEIGHBOUR";
  if (/(intern|eigen)/.test(v)) return "INTERNAL";
  return "OTHER";
}

export const REPORT_IMPORT_FIELDS: ImportField[] = [
  { key: "externalRef", label: "Nr. (eigen register)", hints: ["nr", "nummer", "kenmerk", "id", "volgnummer"] },
  { key: "type", label: "Soort (afwijking, klacht, ongeval, …)", hints: ["soort", "type", "categorie", "soort melding"] },
  { key: "occurredAt", label: "Datum voorval", kind: "date", required: true, hints: ["datum", "datum voorval", "datum melding", "datum incident", "wanneer"] },
  { key: "title", label: "Korte omschrijving", required: true, hints: ["omschrijving", "titel", "onderwerp", "wat is er gebeurd", "melding"] },
  { key: "description", label: "Toelichting", hints: ["toelichting", "beschrijving", "details", "situatie"] },
  { key: "origin", label: "Herkomst (intern, klant, …)", hints: ["herkomst", "bron", "afkomstig van"] },
  { key: "location", label: "Locatie / project", hints: ["locatie", "vestiging", "project", "werk", "plaats"] },
  { key: "discipline", label: "Bedrijfsonderdeel / BU", hints: ["bu", "bedrijfsonderdeel", "discipline", "afdeling"] },
  { key: "reporter", label: "Melder", hints: ["melder", "gemeld door", "ingediend door"] },
  { key: "severity", label: "Ernst", hints: ["ernst", "zwaarte", "impact", "classificatie"] },
  { key: "injury", label: "Letsel", hints: ["letsel", "letselcategorie", "gevolg letsel"] },
  { key: "lostDays", label: "Verzuimdagen", kind: "int", hints: ["verzuimdagen", "dagen verzuim", "aantal verzuimdagen"] },
  { key: "absence", label: "Verzuim (1–15 dagen / meer dan 15 dagen)", hints: ["verzuim", "verzuimklasse", "verzuim 1 15 dagen", "meer dan 15 dagen"] },
  { key: "accidentCategory", label: "Categorie ongeval", hints: ["categorie ongeval", "soort ongeval", "type ongeval", "oorzaak ongeval", "toedracht"] },
  { key: "immediateAction", label: "Directe maatregel", hints: ["directe maatregel", "correctie", "direct genomen maatregel", "eerste actie"] },
  { key: "rootCause", label: "Oorzaak", hints: ["oorzaak", "oorzaakanalyse", "grondoorzaak"] },
  { key: "owner", label: "Behandelaar", hints: ["behandelaar", "eigenaar", "verantwoordelijk"] },
  { key: "status", label: "Status", hints: ["status"] },
  { key: "closedAt", label: "Afgesloten op", kind: "date", hints: ["afgesloten op", "datum afgesloten", "gesloten op"] },
];
