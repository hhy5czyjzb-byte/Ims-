import type { ObjectiveCategory, ObjectiveStatus } from "@prisma/client";
import { normText, type ImportField } from "@/lib/spreadsheet-import";

/** Code van een doelstelling: D-001 (of het eigen nummer). */
export const objectiveCode = (n: number) => `D-${String(n).padStart(3, "0")}`;
export const objectiveDisplayCode = (o: { number: number; externalRef?: string | null }) => o.externalRef || objectiveCode(o.number);

/** Statussen in de volgorde van de grafieken, met kleur (groen/geel/rood/grijs; status, geen reeks). */
export const STATUS_ORDER: ObjectiveStatus[] = ["ACHIEVED", "ON_TRACK", "PARTIAL", "AT_RISK", "OFF_TRACK", "NOT_ACHIEVED", "NOT_ASSESSED", "CANCELLED"];
export const STATUS_COLOR: Record<ObjectiveStatus, string> = {
  ACHIEVED: "#2e7d32",
  ON_TRACK: "#3fa34d",
  PARTIAL: "#f2c12e",
  AT_RISK: "#f5a524",
  OFF_TRACK: "#e04848",
  NOT_ACHIEVED: "#b00010",
  NOT_ASSESSED: "#a3a3a3",
  CANCELLED: "#d4d4d4",
};
/** Eindstatussen (periode voorbij): tellen voor 'behaald-percentage'. */
export const FINAL_STATUSES: ObjectiveStatus[] = ["ACHIEVED", "PARTIAL", "NOT_ACHIEVED"];
export const GOOD: ObjectiveStatus[] = ["ACHIEVED", "ON_TRACK"];
export const WARN: ObjectiveStatus[] = ["AT_RISK", "PARTIAL"];
export const BAD: ObjectiveStatus[] = ["OFF_TRACK", "NOT_ACHIEVED"];

/**
 * Voortgang in % van nulmeting naar streefwaarde (werkt ook bij een dalend doel, bijv. IF of CO2).
 * Geeft null als de getallen ontbreken; begrensd op 0–100 voor de balk (ruw getal in `raw`).
 */
export function objectiveProgress(
  baseline: number | null | undefined,
  target: number | null | undefined,
  current: number | null | undefined,
): { pct: number; raw: number } | null {
  if (baseline == null || target == null || current == null) return null;
  if (target === baseline) return { pct: current === target ? 100 : 0, raw: current === target ? 100 : 0 };
  const raw = ((current - baseline) / (target - baseline)) * 100;
  return { pct: Math.max(0, Math.min(100, Math.round(raw))), raw: Math.round(raw) };
}

/** Status voorstellen uit de voortgang en de verstreken tijd (de gebruiker kiest zelf; dit is een hulp). */
export function suggestStatus(progressPct: number | null, start: Date | null, deadline: Date | null, now = new Date()): ObjectiveStatus | null {
  if (progressPct == null) return null;
  if (progressPct >= 100) return "ACHIEVED";
  if (deadline && now > deadline) return progressPct >= 50 ? "PARTIAL" : "NOT_ACHIEVED";
  if (!start || !deadline || deadline <= start) return progressPct >= 50 ? "ON_TRACK" : "AT_RISK";
  const elapsed = ((now.getTime() - start.getTime()) / (deadline.getTime() - start.getTime())) * 100;
  if (progressPct >= elapsed - 10) return "ON_TRACK";
  if (progressPct >= elapsed - 30) return "AT_RISK";
  return "OFF_TRACK";
}

/** Getal in NL-notatie lezen ("3,8", "≤ 17,4", "1.234"); null als er geen getal in staat. */
export function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const m = String(value ?? "").match(/-?\d[\d.]*(,\d+)?|-?\d+(\.\d+)?/);
  if (!m) return null;
  let t = m[0];
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function parseObjectiveCategory(value: unknown): ObjectiveCategory | null {
  const v = normText(String(value ?? ""));
  if (!v) return null;
  if (/(co2|energie|brandstof|diesel|elektri|stroom|emissie)/.test(v)) return "CO2";
  if (/(milieu|afval|bodem|water|lozing|grondstof|circulair)/.test(v)) return "ENVIRONMENT";
  if (/(veilig|ongeval|if\b|lti|vca|wpi|lmra|toolbox|saq)/.test(v)) return "SAFETY";
  if (/(verzuim|gezond|vitaliteit|arbo)/.test(v)) return "HEALTH";
  if (/(klant|markt|tevreden|omzet|rendement)/.test(v)) return "CUSTOMER";
  if (/(wet|compliance|vergunning|certific|iso|audit)/.test(v)) return "COMPLIANCE";
  if (/(mens|personeel|opleiding|hr|functie|organisatie|samenwerk)/.test(v)) return "PEOPLE";
  if (/(strateg|missie|visie)/.test(v)) return "STRATEGIC";
  if (/(kwaliteit|proces|faalkosten|ims|afwijking)/.test(v)) return "QUALITY";
  return "OTHER";
}

export function parseObjectiveStatus(value: unknown): ObjectiveStatus | null {
  const v = normText(String(value ?? "").replace(/●/g, ""));
  if (!v) return null;
  if (/niet behaald|niet gehaald/.test(v)) return "NOT_ACHIEVED";
  if (/deels|gedeeltelijk/.test(v)) return "PARTIAL";
  if (/behaald|gehaald|gerealiseerd|gereed/.test(v)) return "ACHIEVED";
  if (/achter|vertraagd/.test(v)) return "OFF_TRACK";
  if (/aandacht|risico/.test(v)) return "AT_RISK";
  if (/op koers|op schema|loopt/.test(v)) return "ON_TRACK";
  if (/vervallen|geschrapt/.test(v)) return "CANCELLED";
  return null;
}

export const OBJECTIVE_IMPORT_FIELDS: ImportField[] = [
  { key: "externalRef", label: "Nr. (eigen register)", hints: ["nr", "nummer", "id"] },
  { key: "title", label: "Doelstelling", required: true, hints: ["doelstelling", "doel", "omschrijving", "titel"] },
  { key: "category", label: "Categorie", hints: ["categorie", "thema", "soort", "aspect"] },
  { key: "indicator", label: "Indicator / KPI", hints: ["indicator", "kpi", "meetmethode", "indicator en streefwaarde"] },
  { key: "baselineText", label: "Nulmeting", hints: ["nulmeting", "uitgangssituatie", "basis", "2025"] },
  { key: "targetText", label: "Streefwaarde", hints: ["streefwaarde", "doelwaarde", "norm", "target"] },
  { key: "owner", label: "Eigenaar", hints: ["eigenaar", "verantwoordelijk", "wie"] },
  { key: "deadline", label: "Termijn / deadline", hints: ["termijn", "deadline", "gereed", "datum"] },
  { key: "discipline", label: "Bedrijfsonderdeel", hints: ["bu", "bedrijfsonderdeel", "discipline"] },
  { key: "status", label: "Status", hints: ["status", "resultaat", "stand van zaken"] },
  { key: "explanation", label: "Toelichting status (oorzaak en vervolg)", hints: ["oorzaak en vervolg", "toelichting", "opmerking", "vervolg"] },
];

/** SMART-controle: welke letters zijn ingevuld? */
export type SmartInput = {
  title?: string | null;
  description?: string | null;
  indicator?: string | null;
  targetText?: string | null;
  targetValue?: unknown;
  ownerId?: string | null;
  ownerText?: string | null;
  acceptance?: string | null;
  feasibility?: string | null;
  deadline?: Date | null;
  termText?: string | null;
};
export const SMART_LETTERS = [
  { key: "S", label: "Specifiek", hint: "wat precies (doelstelling + toelichting)" },
  { key: "M", label: "Meetbaar", hint: "indicator en streefwaarde" },
  { key: "A", label: "Acceptabel", hint: "eigenaar die het heeft aangenomen" },
  { key: "R", label: "Realistisch", hint: "onderbouwing haalbaarheid en middelen" },
  { key: "T", label: "Tijdgebonden", hint: "deadline of termijn" },
] as const;
export type SmartKey = (typeof SMART_LETTERS)[number]["key"];

const filled = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "";

export function smartCheck(o: SmartInput): { ok: boolean; letters: Record<SmartKey, boolean>; missing: string[] } {
  const letters: Record<SmartKey, boolean> = {
    S: filled(o.title) && filled(o.description),
    M: filled(o.indicator) && (filled(o.targetText) || filled(o.targetValue)),
    A: filled(o.ownerId) || filled(o.ownerText),
    R: filled(o.feasibility),
    T: !!o.deadline || filled(o.termText),
  };
  const missing = SMART_LETTERS.filter((l) => !letters[l.key]).map((l) => `${l.label} (${l.hint})`);
  return { ok: missing.length === 0, letters, missing };
}
