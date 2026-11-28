import type { ActionSource, InjuryLevel, ReportOrigin, ReportSeverity, ReportStatus, ReportType } from "@prisma/client";
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
  { key: "lostDays", label: "Verzuimdagen", kind: "int", hints: ["verzuimdagen", "verzuim", "dagen verzuim"] },
  { key: "immediateAction", label: "Directe maatregel", hints: ["directe maatregel", "correctie", "direct genomen maatregel", "eerste actie"] },
  { key: "rootCause", label: "Oorzaak", hints: ["oorzaak", "oorzaakanalyse", "grondoorzaak"] },
  { key: "owner", label: "Behandelaar", hints: ["behandelaar", "eigenaar", "verantwoordelijk"] },
  { key: "status", label: "Status", hints: ["status"] },
  { key: "closedAt", label: "Afgesloten op", kind: "date", hints: ["afgesloten op", "datum afgesloten", "gesloten op"] },
];
