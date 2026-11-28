import type { AspectPriority, AspectSiteType } from "@prisma/client";
import { aspectRisk, aspectRiskLevel, prioritySignal } from "@/lib/aspects";

export type StatAspect = {
  businessUnit: string | null;
  locationText: string | null;
  contextFactor: string | null;
  theme: string | null;
  siteType: AspectSiteType;
  inOperation: boolean;
  priority: AspectPriority | null;
  opportunity: boolean;
  origin: string | null;
  lifecycleSource: string | null;
  effectScore: unknown;
  exposure: unknown;
  probability: unknown;
};

export type AspectCounts = {
  total: number;
  high: number;
  medium: number;
  low: number;
  noPrio: number;
  significant: number;
  significantOpportunities: number;
  riskHigh: number; // hoog of zeer hoog
  riskMedium: number;
  riskLow: number;
  notScored: number;
  opportunities: number;
  projects: number;
  signalLower: number;
  signalHigher: number;
  lifecycleConcept: number;
  addition: number; // herkomst "Aanvulling …"
};

/** Tellingen zoals op het overzichtsblad van het MAR; alleen aspecten op locaties die in werking zijn. */
export function countAspects(list: StatAspect[]): AspectCounts {
  const c: AspectCounts = {
    total: 0,
    high: 0,
    medium: 0,
    low: 0,
    noPrio: 0,
    significant: 0,
    significantOpportunities: 0,
    riskHigh: 0,
    riskMedium: 0,
    riskLow: 0,
    notScored: 0,
    opportunities: 0,
    projects: 0,
    signalLower: 0,
    signalHigher: 0,
    lifecycleConcept: 0,
    addition: 0,
  };
  for (const a of list) {
    if (!a.inOperation) continue;
    c.total++;
    if (a.priority === "HIGH") c.high++;
    else if (a.priority === "MEDIUM") c.medium++;
    else if (a.priority === "LOW") c.low++;
    else c.noPrio++;
    const sig = a.priority === "HIGH" || a.priority === "MEDIUM";
    if (sig) c.significant++;
    if (sig && a.opportunity) c.significantOpportunities++;
    const risk = aspectRisk(a.effectScore as never, a.exposure as never, a.probability as never);
    const level = aspectRiskLevel(risk);
    if (level === "high" || level === "veryHigh") c.riskHigh++;
    else if (level === "medium") c.riskMedium++;
    else if (level === "low") c.riskLow++;
    else c.notScored++;
    if (a.opportunity) c.opportunities++;
    if (a.siteType === "PROJECT") c.projects++;
    const s = prioritySignal({ priority: a.priority, risk, opportunity: a.opportunity });
    if (s === "lower") c.signalLower++;
    if (s === "higher") c.signalHigher++;
    if (/concept/i.test(a.lifecycleSource ?? "")) c.lifecycleConcept++;
    if (/aanvulling/i.test(a.origin ?? "")) c.addition++;
  }
  return c;
}

export type BreakdownKey = "bu" | "locatie" | "context" | "thema";
export const BREAKDOWN_LABEL: Record<BreakdownKey, string> = { bu: "Bedrijfsonderdeel", locatie: "Locatie", context: "Contextfactor", thema: "Milieuthema" };
const FIELD: Record<BreakdownKey, keyof StatAspect> = { bu: "businessUnit", locatie: "locationText", context: "contextFactor", thema: "theme" };

/** Tellingen per bedrijfsonderdeel, locatie, contextfactor of thema (volgorde: meeste aspecten eerst). */
export function breakdown(list: StatAspect[], by: BreakdownKey): { value: string; counts: AspectCounts }[] {
  const groups = new Map<string, StatAspect[]>();
  for (const a of list) {
    const v = (a[FIELD[by]] as string | null) ?? "(leeg)";
    groups.set(v, [...(groups.get(v) ?? []), a]);
  }
  return [...groups.entries()]
    .map(([value, items]) => ({ value, counts: countAspects(items), all: items.length }))
    .sort((x, y) => y.counts.total - x.counts.total || y.all - x.all || x.value.localeCompare(y.value, "nl"))
    .map(({ value, counts }) => ({ value, counts }));
}
