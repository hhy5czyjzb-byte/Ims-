import type { RiskType } from "@prisma/client";
import { brand } from "@/theme/brand";

/**
 * Risico- en kansenmatrix 5×5: score = kans × effect (1–25).
 * Voor risico's is een hoge score ongunstig (rood); voor kansen is een hoge
 * score juist aantrekkelijk (groen). De klassengrenzen zijn voor beide gelijk.
 */
export const RISK_SCALE = [1, 2, 3, 4, 5] as const;

export type RiskLevel = "low" | "medium" | "high" | "veryHigh";

export const LIKELIHOOD_LABEL: Record<number, string> = {
  1: "Zeer onwaarschijnlijk",
  2: "Onwaarschijnlijk",
  3: "Mogelijk",
  4: "Waarschijnlijk",
  5: "Vrijwel zeker",
};

export const IMPACT_LABEL: Record<RiskType, Record<number, string>> = {
  RISK: { 1: "Verwaarloosbaar", 2: "Gering", 3: "Matig", 4: "Ernstig", 5: "Zeer ernstig" },
  OPPORTUNITY: { 1: "Zeer klein", 2: "Klein", 3: "Redelijk", 4: "Groot", 5: "Zeer groot" },
};

export function riskScore(likelihood: number, impact: number): number {
  return likelihood * impact;
}

export function riskLevel(score: number): RiskLevel {
  if (score >= 15) return "veryHigh";
  if (score >= 10) return "high";
  if (score >= 5) return "medium";
  return "low";
}

export const RISK_LEVEL_LABEL: Record<RiskLevel, string> = {
  low: "Laag",
  medium: "Middel",
  high: "Hoog",
  veryHigh: "Zeer hoog",
};

/** Score-ondergrens per klasse (voor filters in de database). */
export const LEVEL_RANGE: Record<RiskLevel, [number, number]> = {
  low: [1, 4],
  medium: [5, 9],
  high: [10, 14],
  veryHigh: [15, 25],
};

export function riskColor(score: number, type: RiskType = "RISK"): string {
  const level = riskLevel(score);
  return type === "OPPORTUNITY" ? brand.opportunityColors[level] : brand.riskColors[level];
}

/** Tekstkleur die leesbaar is op de achtergrondkleur van de klasse. */
export function riskTextColor(score: number, type: RiskType = "RISK"): string {
  const level = riskLevel(score);
  if (type === "OPPORTUNITY") return level === "high" || level === "veryHigh" ? "#ffffff" : "#1f2937";
  return level === "veryHigh" || level === "low" ? "#ffffff" : "#1f2937";
}

/** Restrisico: score na maatregelen, of — als die nog niet beoordeeld is — de bruto score. */
export function residual(r: { likelihoodBefore: number; impactBefore: number; likelihoodAfter: number | null; impactAfter: number | null }) {
  const assessed = r.likelihoodAfter != null && r.impactAfter != null;
  const likelihood = assessed ? r.likelihoodAfter! : r.likelihoodBefore;
  const impact = assessed ? r.impactAfter! : r.impactBefore;
  return { likelihood, impact, score: riskScore(likelihood, impact), assessed };
}

export function riskCode(number: number, type: RiskType): string {
  return `${type === "OPPORTUNITY" ? "K" : "R"}-${String(number).padStart(3, "0")}`;
}
