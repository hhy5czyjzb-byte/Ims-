import type { RiskCategory, RiskType, TreatmentStatus } from "@prisma/client";
import { normText, type ImportField } from "@/lib/spreadsheet-import";

/**
 * Import van het risico- en kansenregister (opbouw van het register van Rouwmaat Groep:
 * tabbladen "Risico's" en "Kansen"). Score, niveau en prioriteit rekent de app zelf.
 */
export const RISK_IMPORT_FIELDS: ImportField[] = [
  { key: "externalRef", label: "Nr. (bijv. R01, K12)", hints: ["nr", "nummer", "code", "kenmerk"] },
  { key: "type", label: "Soort (risico of kans)", preview: "riskType", hints: ["soort", "risico of kans", "type risico"] },
  { key: "title", label: "Omschrijving", required: true, hints: ["omschrijving", "titel", "naam", "beschrijving"] },
  { key: "origin", label: "Herkomst", hints: ["herkomst"] },
  { key: "priority", label: "Prioriteit (★ = strategisch)", hints: ["prioriteit", "prio"] },
  { key: "contextFactor", label: "Contextfactor", hints: ["contextfactor", "context factor"] },
  { key: "theme", label: "Thema", hints: ["thema", "categorie"] },
  { key: "bu", label: "BU / discipline (meerdere met komma)", hints: ["bu", "business unit", "discipline", "afdeling", "bu s"] },
  { key: "cause", label: "Oorzaak / aanleiding", hints: ["oorzaak context", "oorzaak", "aanleiding", "context"] },
  { key: "consequence", label: "Gevolg / opbrengst", hints: ["gevolg", "gevolgen", "opbrengst"] },
  { key: "likelihood", label: "Kans (1–5)", required: true, kind: "int", hints: ["kans", "waarschijnlijkheid"] },
  { key: "impact", label: "Effect (1–5)", required: true, kind: "int", hints: ["effect", "impact", "ernst"] },
  {
    key: "measures",
    label: "Beheersmaatregel / actie om te benutten",
    hints: ["beheersmaatregel", "beheersmaatregelen", "actie om te benutten", "maatregel", "maatregelen"],
  },
  { key: "owner", label: "Eigenaar", hints: ["eigenaar", "verantwoordelijk", "verantwoordelijke"] },
  { key: "term", label: "Termijn", hints: ["termijn", "deadline", "planning"] },
  { key: "treatmentStatus", label: "Status (aanpak)", preview: "treatmentStatus", hints: ["status", "status aanpak"] },
  { key: "monitoring", label: "Monitoring / KPI", hints: ["monitoring kpi", "monitoring", "kpi"] },
  { key: "framework", label: "Kader", hints: ["kader", "normen", "norm"] },
  { key: "likelihoodAfter", label: "Restkans (1–5)", kind: "int", hints: ["restkans", "kans na maatregelen"] },
  { key: "impactAfter", label: "Resteffect (1–5)", kind: "int", hints: ["resteffect", "effect na maatregelen"] },
  { key: "lastReviewedAt", label: "Laatst beoordeeld", kind: "date", hints: ["laatst beoordeeld", "datum beoordeling", "beoordeeld op"] },
  { key: "notes", label: "Opmerking", hints: ["opmerking", "opmerkingen"] },
  { key: "location", label: "Locatie", hints: ["locatie", "vestiging"] },
];

/** Risico of kans: uit de kolom "Soort", anders uit het nummer (K… = kans). */
export function parseRiskType(typeText: unknown, code: unknown): RiskType {
  const t = normText(String(typeText ?? ""));
  if (t.startsWith("kans") || t === "opportunity") return "OPPORTUNITY";
  if (t.startsWith("risico") || t === "risk") return "RISK";
  return /^\s*k/i.test(String(code ?? "")) ? "OPPORTUNITY" : "RISK";
}

/** ★ strategisch: prioriteit met ster of "1", of herkomst Contextanalyse. */
export function parseStrategic(priority: unknown, origin: unknown): boolean {
  const p = String(priority ?? "").trim();
  if (p.includes("★") || /^1(\D|$)/.test(p) || /strategisch/i.test(p)) return true;
  return normText(String(origin ?? "")) === "contextanalyse";
}

export function parseTreatmentStatus(value: unknown): TreatmentStatus | null {
  const v = normText(String(value ?? ""));
  if (!v) return null;
  if (/^(open|nieuw|niet gestart)$/.test(v)) return "OPEN";
  if (/^(gepland|planned)$/.test(v)) return "PLANNED";
  if (/(in uitvoering|bezig|loopt)/.test(v)) return "IN_PROGRESS";
  if (/(doorlopend|continu|structureel)/.test(v)) return "ONGOING";
  if (/(afgerond|gereed|klaar|done|gesloten)/.test(v)) return "DONE";
  return null;
}

/** Categorie op basis van het thema. */
export function categoryFromTheme(theme: unknown): RiskCategory {
  const v = normText(String(theme ?? ""));
  if (/(wet|regelgeving|compliance|vergunning)/.test(v)) return "COMPLIANCE";
  if (/(veilig|arbo|gezond|vca|scl)/.test(v)) return "SAFETY";
  if (/(energie|co2|co )|^co$/.test(v)) return "CO2";
  if (/(milieu|klimaat|grondstof|circulair|bodem)/.test(v)) return "ENVIRONMENT";
  if (/(kwaliteit|certificer|managementsysteem)/.test(v)) return "QUALITY";
  return v ? "STRATEGIC" : "OTHER";
}

/** BU's uit één cel ("Beton, Prefab"; "Groep" = bedrijfsbreed). Slashes horen bij de naam ("Afval/Transport"). */
export function splitBUs(value: unknown): string[] {
  return String(value ?? "")
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter((s) => s && normText(s) !== "groep" && normText(s) !== "bedrijfsbreed");
}
