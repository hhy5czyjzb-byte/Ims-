import type { AspectPriority, AspectSiteType, Prisma } from "@prisma/client";
import { aspectRisk, aspectRiskLevel, prioritySignal, type AspectRiskLevel } from "@/lib/aspects";

export type AspectSearch = {
  q?: string;
  bu?: string;
  locatie?: string;
  type?: string; // vestiging / project / groep
  werking?: string; // ja / nee
  activiteit?: string;
  thema?: string;
  context?: string;
  prio?: string; // HIGH / MEDIUM / LOW / geen
  significant?: string;
  niveau?: string; // risiconiveau (in code)
  soort?: string; // kans / bedreiging
  signaal?: string; // ja / lower / higher (in code)
  levenscyclus?: string; // concept
  herkomst?: string;
  eigenaar?: string;
  proces?: string;
  wet?: string; // gekoppelde wettelijke eis (id)
  risico?: string; // gekoppeld risico / kans (id)
  co2?: string;
  actief?: string;
};

const PRIOS = ["HIGH", "MEDIUM", "LOW"];
const SITE_TYPES = ["SITE", "PROJECT", "GROUP"];

/** Filters van het milieuaspectenregister die in de database kunnen (gedeeld met de export); voorwaarden in AND. */
export function aspectWhere(sp: AspectSearch, userId: string): Prisma.EnvironmentalAspectWhereInput {
  const and: Prisma.EnvironmentalAspectWhereInput[] = [];
  if (sp.actief === "nee") and.push({ active: false });
  else if (sp.actief !== "alle") and.push({ active: true });
  if (sp.q) {
    const q = { contains: sp.q, mode: "insensitive" as const };
    and.push({
      OR: [
        { activity: q },
        { aspect: q },
        { impact: q },
        { controls: q },
        { measure: q },
        { mba: q },
        { legalText: q },
        { externalRef: { equals: sp.q.trim(), mode: "insensitive" } },
      ],
    });
  }
  if (sp.bu) and.push({ businessUnit: sp.bu });
  if (sp.locatie) and.push({ locationText: sp.locatie });
  if (sp.type && SITE_TYPES.includes(sp.type)) and.push({ siteType: sp.type as AspectSiteType });
  if (sp.werking === "ja") and.push({ inOperation: true });
  else if (sp.werking === "nee") and.push({ inOperation: false });
  if (sp.activiteit) and.push({ activity: sp.activiteit });
  if (sp.thema) and.push({ theme: sp.thema });
  if (sp.context) and.push({ contextFactor: sp.context });
  if (sp.prio === "geen") and.push({ priority: null });
  else if (sp.prio && PRIOS.includes(sp.prio)) and.push({ priority: sp.prio as AspectPriority });
  if (sp.significant === "ja") and.push({ significant: true });
  else if (sp.significant === "nee") and.push({ significant: false });
  if (sp.soort === "kans") and.push({ opportunity: true });
  else if (sp.soort === "bedreiging") and.push({ opportunity: false });
  if (sp.levenscyclus === "concept") and.push({ lifecycleSource: { contains: "concept", mode: "insensitive" } });
  if (sp.herkomst) and.push({ origin: sp.herkomst });
  if (sp.eigenaar === "mij") and.push({ ownerId: userId });
  else if (sp.eigenaar) and.push({ ownerText: sp.eigenaar });
  if (sp.proces) and.push({ processes: { some: { id: sp.proces } } });
  if (sp.wet) and.push({ legalRequirements: { some: { id: sp.wet } } });
  if (sp.risico) and.push({ risks: { some: { id: sp.risico } } });
  if (sp.co2 === "ja") and.push({ co2Relevant: true });
  return and.length ? { AND: and } : {};
}

type Scored = {
  effectScore: unknown;
  exposure: unknown;
  probability: unknown;
  priority: AspectPriority | null;
  opportunity: boolean;
};

/** Filters op berekende waarden (risiconiveau en signaal), toegepast in code. */
export function aspectMatches(sp: AspectSearch, a: Scored): boolean {
  if (!sp.niveau && !sp.signaal) return true;
  const risk = aspectRisk(a.effectScore as never, a.exposure as never, a.probability as never);
  if (sp.niveau) {
    const level = aspectRiskLevel(risk);
    if (sp.niveau === "geen") {
      if (level !== null) return false;
    } else if (sp.niveau === "hoog+") {
      if (level !== "high" && level !== "veryHigh") return false;
    } else if (level !== (sp.niveau as AspectRiskLevel)) return false;
  }
  if (sp.signaal) {
    const s = prioritySignal({ priority: a.priority, risk, opportunity: a.opportunity });
    if (sp.signaal === "ja" ? s === null : s !== sp.signaal) return false;
  }
  return true;
}
