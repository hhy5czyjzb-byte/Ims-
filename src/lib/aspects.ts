import type { AspectPriority, AspectType, OperatingSituation } from "@prisma/client";
import { normText } from "@/lib/spreadsheet-import";

/**
 * Milieuaspecten (ISO 14001 6.1.2) volgens het milieuaspectenregister (MAR) van Rouwmaat.
 * - Risico = effect (E) × voorkomen (B) × waarschijnlijkheid (W) — Fine & Kinney.
 *   Niveau: ≤ 20 laag, 21–70 middel, 71–200 hoog, > 200 zeer hoog.
 * - Prio (H/M/L) is de eigen weging (risico, levenscyclus, wetgeving, stakeholders). Wanneer een aspect significant is,
 *   is instelbaar (SignificanceRule); standaard bij prio H, risico hoog of een wettelijke eis.
 * - Signaal: prio wijkt af van het risiconiveau (kansen tellen niet mee).
 */

export function aspectCode(number: number): string {
  return `MA-${String(number).padStart(3, "0")}`;
}

/** Code zoals de gebruiker die kent: het nummer uit het eigen register (A001), anders MA-001. */
export function aspectDisplayCode(a: { number: number; externalRef?: string | null }): string {
  return a.externalRef || aspectCode(a.number);
}

type Num = number | string | { toString(): string } | null | undefined;
const toNum = (v: Num): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(typeof v === "object" ? v.toString() : v);
  return Number.isFinite(n) ? n : null;
};

/** Risico = E × B × W (afgerond op 2 decimalen); null als een van de drie ontbreekt. */
export function aspectRisk(effect: Num, exposure: Num, probability: Num): number | null {
  const e = toNum(effect);
  const b = toNum(exposure);
  const w = toNum(probability);
  if (e === null || b === null || w === null) return null;
  return Math.round(e * b * w * 100) / 100;
}

export type AspectRiskLevel = "low" | "medium" | "high" | "veryHigh";

export function aspectRiskLevel(risk: number | null): AspectRiskLevel | null {
  if (risk === null) return null;
  if (risk <= 20) return "low";
  if (risk <= 70) return "medium";
  if (risk <= 200) return "high";
  return "veryHigh";
}

export const ASPECT_RISK_LEVEL_LABEL: Record<AspectRiskLevel, string> = { low: "Laag", medium: "Middel", high: "Hoog", veryHigh: "Zeer hoog" };
export const ASPECT_RISK_LEVEL_APPROACH: Record<AspectRiskLevel, string> = {
  low: "Bestaande beheersing volstaat.",
  medium: "Aandacht nodig, beheersing controleren.",
  high: "Maatregelen nodig.",
  veryHigh: "Direct ingrijpen.",
};
export const ASPECT_RISK_LEVEL_CLASS: Record<AspectRiskLevel, string> = {
  low: "bg-green-100 text-green-800",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-red-100 text-brand-red-dark",
  veryHigh: "bg-brand-red text-white",
};

/** Schalen met betekenis (uit de toelichting bij het register). */
export const EFFECT_SCALE: [number, string][] = [
  [1, "Gering: nauwelijks merkbaar, geen klachten"],
  [3, "Belangrijk: plaatselijke hinder of kleine verontreiniging, snel te herstellen"],
  [7, "Ernstig: hinder voor de omgeving of verontreiniging die sanering vraagt"],
  [15, "Zeer ernstig: blijvende schade aan bodem, water of natuur"],
  [40, "Ramp: grote schade buiten de locatie, bijv. bij brand of asbestverspreiding"],
];
export const EXPOSURE_SCALE: [number, string][] = [
  [0.5, "Zeer zelden: minder dan eens per jaar"],
  [1, "Zelden: jaarlijks"],
  [2, "Soms: maandelijks"],
  [3, "Af en toe: wekelijks"],
  [6, "Regelmatig: dagelijks"],
  [10, "Voortdurend"],
];
export const PROBABILITY_SCALE: [number, string][] = [
  [0.1, "Vrijwel onmogelijk"],
  [0.2, "Praktisch onmogelijk"],
  [0.5, "Denkbaar, maar onwaarschijnlijk"],
  [1, "Onwaarschijnlijk, maar mogelijk"],
  [3, "Ongewoon, maar mogelijk"],
  [6, "Goed mogelijk"],
  [10, "Te verwachten"],
];

export function isSignificant(priority: AspectPriority | null | undefined): boolean {
  return priority === "HIGH" || priority === "MEDIUM";
}

/**
 * Wanneer is een aspect significant? Instelbaar door QHSE (AppSetting `aspects.significanceRule`).
 * Standaard: prio hoog, risico hoog of hoger, of een wettelijke eis. Ook instelbaar: prio middel/laag en klachten.
 */
export type SignificanceRule = {
  priorities: AspectPriority[];
  minRiskLevel: AspectRiskLevel | null;
  legal: boolean;
  complaints: boolean;
};
export const SIGNIFICANCE_RULE_KEY = "aspects.significanceRule";
/** Standaard (keuze Rouwmaat): significant bij prio hoog, risico hoog of hoger, of een wettelijke eis (wetgeving is altijd significant). */
export const DEFAULT_SIGNIFICANCE_RULE: SignificanceRule = { priorities: ["HIGH"], minRiskLevel: "high", legal: true, complaints: false };

const PRIOS: AspectPriority[] = ["HIGH", "MEDIUM", "LOW"];
const LEVELS: AspectRiskLevel[] = ["low", "medium", "high", "veryHigh"];

/** Opgeslagen regel inlezen; onbekend of beschadigd → standaardregel. */
export function parseSignificanceRule(value: string | null | undefined): SignificanceRule {
  if (!value) return DEFAULT_SIGNIFICANCE_RULE;
  try {
    const v = JSON.parse(value) as Partial<SignificanceRule>;
    return {
      priorities: Array.isArray(v.priorities) ? PRIOS.filter((p) => v.priorities!.includes(p)) : DEFAULT_SIGNIFICANCE_RULE.priorities,
      minRiskLevel: v.minRiskLevel && LEVELS.includes(v.minRiskLevel) ? v.minRiskLevel : null,
      legal: v.legal === true,
      complaints: v.complaints === true,
    };
  } catch {
    return DEFAULT_SIGNIFICANCE_RULE;
  }
}

const PRIO_NAME: Record<AspectPriority, string> = { HIGH: "H", MEDIUM: "M", LOW: "L" };

export function determineAspectSignificance(
  a: { priority: AspectPriority | null; effectScore: Num; exposure: Num; probability: Num; legalApplies: boolean; complaints: boolean },
  rule: SignificanceRule,
): { significant: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (a.priority && rule.priorities.includes(a.priority)) reasons.push(`Prio ${PRIO_NAME[a.priority]}`);
  if (rule.minRiskLevel) {
    const level = aspectRiskLevel(aspectRisk(a.effectScore, a.exposure, a.probability));
    if (level && LEVELS.indexOf(level) >= LEVELS.indexOf(rule.minRiskLevel)) reasons.push(`Risico ${ASPECT_RISK_LEVEL_LABEL[level].toLowerCase()}`);
  }
  if (rule.legal && a.legalApplies) reasons.push("Wettelijke eis");
  if (rule.complaints && a.complaints) reasons.push("Klachten");
  return { significant: reasons.length > 0, reasons };
}

/** Leesbare omschrijving, bijv. "prio H of M, of risico hoog of hoger". */
export function describeSignificanceRule(rule: SignificanceRule): string {
  const parts: string[] = [];
  if (rule.priorities.length) parts.push(`prio ${rule.priorities.map((p) => PRIO_NAME[p]).join(" of ")}`);
  if (rule.minRiskLevel)
    parts.push(rule.minRiskLevel === "veryHigh" ? "risico zeer hoog" : `risico ${ASPECT_RISK_LEVEL_LABEL[rule.minRiskLevel].toLowerCase()} of hoger`);
  if (rule.legal) parts.push("een wettelijke eis");
  if (rule.complaints) parts.push("klachten");
  return parts.length ? parts.join(", of ") : "geen criterium (niets is significant)";
}

const PRIO_RANK: Record<AspectPriority, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
const LEVEL_RANK: Record<AspectRiskLevel, number> = { low: 0, medium: 1, high: 2, veryHigh: 2 };

export type PrioritySignal = "lower" | "higher";

/** Wijkt de prio af van het berekende risiconiveau? Alleen bij bedreigingen met prio en risico. */
export function prioritySignal(a: { priority: AspectPriority | null; risk: number | null; opportunity: boolean }): PrioritySignal | null {
  if (a.opportunity || !a.priority) return null;
  const level = aspectRiskLevel(a.risk);
  if (!level) return null;
  const d = PRIO_RANK[a.priority] - LEVEL_RANK[level];
  return d < 0 ? "lower" : d > 0 ? "higher" : null;
}
export const PRIORITY_SIGNAL_LABEL: Record<PrioritySignal, string> = { lower: "Prio lager dan risico", higher: "Prio hoger dan risico" };

/** Levenscyclusfasen (1 laag, 2 middel, 3 hoog; leeg = n.v.t.). */
export const LIFECYCLE_PHASES = [
  { key: "lcRawMaterials", label: "Grondstofwinning" },
  { key: "lcDesign", label: "Ontwerp" },
  { key: "lcProduction", label: "Productie" },
  { key: "lcTransport", label: "Transport" },
  { key: "lcUse", label: "Gebruik" },
  { key: "lcEndOfLife", label: "Einde levensduur" },
  { key: "lcDisposal", label: "Definitieve verwijdering" },
] as const;
export type LifecycleKey = (typeof LIFECYCLE_PHASES)[number]["key"];
export const LIFECYCLE_SCORE_LABEL: Record<number, string> = { 1: "Laag", 2: "Middel", 3: "Hoog" };

/** Type aspect afgeleid uit het milieuthema (anders uit de omschrijving). */
export function aspectTypeFromTheme(theme: string | null | undefined, ...fallback: unknown[]): AspectType {
  const t = normText(theme ?? "");
  const map: [RegExp, AspectType][] = [
    [/^geluid/, "NOISE"],
    [/^trilling/, "VIBRATION"],
    [/^(lucht|stof|verwaaien|f gassen)/, "AIR"],
    [/^geur/, "ODOUR"],
    [/^licht/, "LIGHT"],
    [/^bodem/, "SOIL"],
    [/^water/, "WATER"],
    [/^(energie|co2|co 2|co)/, "ENERGY"],
    [/^afval/, "WASTE"],
    [/^grondstof/, "RESOURCES"],
    [/^(natuur|calamiteit)/, "OTHER"],
  ];
  for (const [re, type] of map) if (re.test(t)) return type;
  for (const v of fallback) {
    const s = normText(String(v ?? ""));
    if (!s) continue;
    if (/(afvalwater|riool|lozing|water)/.test(s)) return "WATER";
    if (/(geluid|lawaai)/.test(s)) return "NOISE";
    if (/(stof|lucht|emissie|uitstoot)/.test(s)) return "AIR";
    if (/(bodem|lekkage|morsen)/.test(s)) return "SOIL";
    if (/(energie|elektriciteit|brandstof|diesel|gas)/.test(s)) return "ENERGY";
    if (/afval/.test(s)) return "WASTE";
  }
  return "OTHER";
}

/** Calamiteiten (brand, lekkage bij incidenten) zijn noodsituaties; de rest normaal. */
export function situationFromTheme(theme: string | null | undefined): OperatingSituation {
  return /^calamiteit/.test(normText(theme ?? "")) ? "EMERGENCY" : "NORMAL";
}

/** Relevant voor de CO2-prestatieladder: thema energie/CO2 of contextfactor energie en CO2. */
export function defaultCo2Relevant(theme: string | null | undefined, contextFactor?: string | null): boolean {
  const t = normText(theme ?? "");
  return /^(energie|co2|co 2|co)\b/.test(t) || /energie/.test(normText(contextFactor ?? ""));
}

export const SITUATION_ORDER: OperatingSituation[] = ["NORMAL", "ABNORMAL", "EMERGENCY"];
