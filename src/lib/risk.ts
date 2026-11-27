import type { RiskType } from "@prisma/client";
import { brand } from "@/theme/brand";

/**
 * Risico- en kansenmatrix 5×5: score = kans × effect (1–25).
 * Voor risico's is een hoge score ongunstig (rood); voor kansen is een hoge
 * score juist aantrekkelijk (groen). De klassengrenzen zijn voor beide gelijk.
 */
export const RISK_SCALE = [1, 2, 3, 4, 5] as const;

export type RiskLevel = "low" | "medium" | "high";

/** Kans en effect volgens het risico- en kansenregister van Rouwmaat Groep. */
export const LIKELIHOOD_LABEL: Record<number, string> = {
  1: "Zeer onwaarschijnlijk",
  2: "Onwaarschijnlijk",
  3: "Mogelijk",
  4: "Waarschijnlijk",
  5: "Vrijwel zeker",
};

export const LIKELIHOOD_HINT: Record<number, string> = {
  1: "vrijwel uitgesloten",
  2: "kan, maar wordt niet verwacht",
  3: "kan zich de komende jaren voordoen",
  4: "verwacht binnen één à twee jaar",
  5: "doet zich nu al voor of binnen een jaar",
};

export const IMPACT_LABEL: Record<RiskType, Record<number, string>> = {
  RISK: { 1: "Gering", 2: "Beperkt", 3: "Merkbaar", 4: "Ernstig", 5: "Zeer ernstig" },
  OPPORTUNITY: { 1: "Gering", 2: "Beperkt", 3: "Merkbaar", 4: "Groot", 5: "Strategisch" },
};

export const IMPACT_HINT: Record<RiskType, Record<number, string>> = {
  RISK: {
    1: "nauwelijks merkbaar",
    2: "kleine verstoring, eenvoudig te herstellen",
    3: "verzuimongeval, verstoring van een BU, beperkte milieuschade of klacht",
    4: "ernstig letsel, langdurige verstoring, handhaving of regionale imagoschade",
    5: "blijvend letsel of erger, ernstige milieuschade, verlies van vergunning of certificaat",
  },
  OPPORTUNITY: {
    1: "nauwelijks merkbaar",
    2: "klein voordeel",
    3: "duidelijk voordeel voor één BU",
    4: "merkbaar voor meerdere BU's",
    5: "groepsbreed en blijvend voordeel",
  },
};

export function riskScore(likelihood: number, impact: number): number {
  return likelihood * impact;
}

/** Niveau: laag 1–7, midden 8–14, hoog 15–25. */
export function riskLevel(score: number): RiskLevel {
  if (score >= 15) return "high";
  if (score >= 8) return "medium";
  return "low";
}

export const RISK_LEVEL_LABEL: Record<RiskLevel, string> = {
  low: "Laag",
  medium: "Midden",
  high: "Hoog",
};

/** Wat het niveau betekent (uit de toelichting bij het register). */
export const RISK_LEVEL_APPROACH: Record<RiskLevel, { risk: string; opportunity: string }> = {
  high: {
    risk: "Directie volgt dit actief; maatregel met eigenaar en termijn, bespreken in elk managementoverleg.",
    opportunity: "Actief oppakken en vertalen naar een doelstelling.",
  },
  medium: { risk: "Eigenaar in BU of afdeling plant een actie; halfjaarlijks volgen.", opportunity: "Uitwerken waar ruimte en capaciteit is." },
  low: { risk: "Meenemen in de reguliere werkwijze; jaarlijks herbeoordelen.", opportunity: "Volgen; oppakken als de kans groter wordt." },
};

/** Prioriteit: ★ 1 strategisch (uit de contextanalyse), 2 hoog (aanvullend met niveau Hoog), 3 regulier. */
export function riskPriority(r: { strategic: boolean; likelihoodBefore: number; impactBefore: number }): 1 | 2 | 3 {
  if (r.strategic) return 1;
  return riskLevel(r.likelihoodBefore * r.impactBefore) === "high" ? 2 : 3;
}

export const PRIORITY_LABEL: Record<1 | 2 | 3, string> = { 1: "★ 1 · Strategisch", 2: "2 · Hoog", 3: "3 · Regulier" };

/** Score-ondergrens per klasse (voor filters in de database). */
export const LEVEL_RANGE: Record<RiskLevel, [number, number]> = {
  low: [1, 7],
  medium: [8, 14],
  high: [15, 25],
};

export function riskColor(score: number, type: RiskType = "RISK"): string {
  const level = riskLevel(score);
  return type === "OPPORTUNITY" ? brand.opportunityColors[level] : brand.riskColors[level];
}

/** Tekstkleur die leesbaar is op de achtergrondkleur van de klasse. */
export function riskTextColor(score: number, type: RiskType = "RISK"): string {
  const level = riskLevel(score);
  if (type === "OPPORTUNITY") return level === "high" ? "#ffffff" : "#1f2937";
  return level === "medium" ? "#1f2937" : "#ffffff";
}

/** Restrisico: score na maatregelen, of — als die nog niet beoordeeld is — de bruto score. */
export function residual(r: { likelihoodBefore: number; impactBefore: number; likelihoodAfter: number | null; impactAfter: number | null }) {
  const assessed = r.likelihoodAfter != null && r.impactAfter != null;
  const likelihood = assessed ? r.likelihoodAfter! : r.likelihoodBefore;
  const impact = assessed ? r.impactAfter! : r.impactBefore;
  return { likelihood, impact, score: riskScore(likelihood, impact), assessed };
}

/** Code zoals getoond: het nummer uit het eigen register (R01, K12) als dat er is, anders R-001 / K-001. */
export function riskDisplayCode(r: { number: number; type: RiskType; externalRef?: string | null }): string {
  return r.externalRef || riskCode(r.number, r.type);
}

export function riskCode(number: number, type: RiskType): string {
  return `${type === "OPPORTUNITY" ? "K" : "R"}-${String(number).padStart(3, "0")}`;
}
