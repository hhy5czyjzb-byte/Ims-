import type { AspectType, OperatingSituation, Prisma } from "@prisma/client";
import { ASPECT_TYPE_LABEL, SITUATION_LABEL } from "@/lib/labels";

export type AspectSearch = {
  q?: string;
  significant?: string;
  type?: string;
  situatie?: string;
  discipline?: string;
  locatie?: string;
  proces?: string;
  eigenaar?: string;
  co2?: string;
  actief?: string;
};

/** Filters van het milieuaspectenregister (gedeeld door overzicht en export); voorwaarden in AND. */
export function aspectWhere(sp: AspectSearch, userId: string): Prisma.EnvironmentalAspectWhereInput {
  const and: Prisma.EnvironmentalAspectWhereInput[] = [];
  if (sp.actief === "nee") and.push({ active: false });
  else if (sp.actief !== "alle") and.push({ active: true });
  if (sp.q) {
    and.push({
      OR: [
        { activity: { contains: sp.q, mode: "insensitive" } },
        { aspect: { contains: sp.q, mode: "insensitive" } },
        { impact: { contains: sp.q, mode: "insensitive" } },
        { controls: { contains: sp.q, mode: "insensitive" } },
        { externalRef: { contains: sp.q, mode: "insensitive" } },
      ],
    });
  }
  if (sp.significant === "ja") and.push({ significant: true });
  else if (sp.significant === "nee") and.push({ significant: false });
  if (sp.type && sp.type in ASPECT_TYPE_LABEL) and.push({ aspectType: sp.type as AspectType });
  if (sp.situatie && sp.situatie in SITUATION_LABEL) and.push({ situation: sp.situatie as OperatingSituation });
  if (sp.discipline) and.push({ disciplineId: sp.discipline });
  if (sp.locatie) and.push({ locationId: sp.locatie });
  if (sp.proces) and.push({ processes: { some: { id: sp.proces } } });
  if (sp.eigenaar === "mij") and.push({ ownerId: userId });
  else if (sp.eigenaar) and.push({ ownerId: sp.eigenaar });
  if (sp.co2 === "ja") and.push({ co2Relevant: true });
  return and.length ? { AND: and } : {};
}
