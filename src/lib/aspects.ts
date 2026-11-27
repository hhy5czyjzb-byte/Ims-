import type { AspectType, OperatingSituation } from "@prisma/client";

/**
 * Milieuaspecten (ISO 14001 6.1.2): scoring en significantie.
 * Score = frequentie/kans (F) × ernst (E) × omvang (O), elk 1–5 → 1–125.
 * Significant als (a) score ≥ drempel, (b) er een bindende verplichting van toepassing is,
 * of (c) belanghebbenden er zorgen over hebben — tenzij KAM het handmatig heeft bepaald.
 */
export const DEFAULT_SIGNIFICANCE_THRESHOLD = 27; // 3 × 3 × 3
export const SIGNIFICANCE_THRESHOLD_KEY = "aspects.significanceThreshold";

export function aspectCode(number: number): string {
  return `MA-${String(number).padStart(3, "0")}`;
}

export function aspectScore(frequency: number | null | undefined, severity: number | null | undefined, extent: number | null | undefined): number | null {
  if (!frequency || !severity || !extent) return null;
  return frequency * severity * extent;
}

export function determineSignificance(input: {
  score: number | null;
  threshold: number;
  legalApplies: boolean;
  stakeholderConcern: boolean;
  manual?: { significant: boolean; reason: string | null } | null;
}): { significant: boolean; reasons: string[] } {
  if (input.manual) {
    return { significant: input.manual.significant, reasons: [`Handmatig bepaald${input.manual.reason ? `: ${input.manual.reason}` : ""}`] };
  }
  const reasons: string[] = [];
  if (input.score !== null && input.score >= input.threshold) reasons.push(`Score ${input.score} ≥ drempel ${input.threshold}`);
  if (input.legalApplies) reasons.push("Bindende verplichting van toepassing");
  if (input.stakeholderConcern) reasons.push("Zorgen bij belanghebbenden");
  return { significant: reasons.length > 0, reasons };
}

/** Aspecttypen die standaard relevant zijn voor de CO2-prestatieladder. */
export function defaultCo2Relevant(type: AspectType): boolean {
  return type === "ENERGY" || type === "AIR" || type === "TRANSPORT";
}

export const SITUATION_ORDER: OperatingSituation[] = ["NORMAL", "ABNORMAL", "EMERGENCY"];
