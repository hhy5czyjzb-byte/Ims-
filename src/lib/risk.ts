import { brand } from "@/theme/brand";

/** Risicomatrix 5×5: score = kans × effect. */
export const RISK_SCALE = [1, 2, 3, 4, 5] as const;

export type RiskLevel = "low" | "medium" | "high" | "veryHigh";

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

export function riskColor(score: number): string {
  return brand.riskColors[riskLevel(score)];
}
