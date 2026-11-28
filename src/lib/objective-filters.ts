import type { ObjectiveCategory, ObjectiveStatus, Prisma } from "@prisma/client";
import { OBJECTIVE_CATEGORY_LABEL, OBJECTIVE_STATUS_LABEL } from "@/lib/labels";

export type ObjectiveSearch = {
  q?: string;
  categorie?: string;
  status?: string;
  eigenaar?: string;
  discipline?: string;
  jaar?: string;
  norm?: string;
  toetsing?: string;
};

/** Filters van de doelstellingen (gedeeld met de export); voorwaarden in AND. */
export function objectiveWhere(sp: ObjectiveSearch, userId?: string, now = new Date()): Prisma.ObjectiveWhereInput {
  const and: Prisma.ObjectiveWhereInput[] = [];
  const status = sp.status ?? "lopend";
  if (status === "lopend") and.push({ active: true, status: { notIn: ["ACHIEVED", "NOT_ACHIEVED", "PARTIAL", "CANCELLED"] } });
  else if (status === "afgerond") and.push({ status: { in: ["ACHIEVED", "NOT_ACHIEVED", "PARTIAL"] } });
  else if (status === "aandacht") and.push({ active: true, status: { in: ["AT_RISK", "OFF_TRACK"] } });
  else if (status in OBJECTIVE_STATUS_LABEL) and.push({ status: status as ObjectiveStatus });
  if (sp.categorie && sp.categorie in OBJECTIVE_CATEGORY_LABEL) and.push({ category: sp.categorie as ObjectiveCategory });
  if (sp.eigenaar === "mij" && userId) and.push({ ownerId: userId });
  else if (sp.eigenaar) and.push({ ownerId: sp.eigenaar });
  if (sp.discipline) and.push({ disciplineId: sp.discipline });
  if (sp.norm) and.push({ norms: { some: { id: sp.norm } } });
  const year = Number(sp.jaar);
  if (Number.isInteger(year) && year > 2000 && year < 2100)
    and.push({ deadline: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } });
  if (sp.toetsing === "verlopen")
    and.push({ active: true, nextReviewDate: { lt: now }, status: { notIn: ["ACHIEVED", "NOT_ACHIEVED", "PARTIAL", "CANCELLED"] } });
  if (sp.q) {
    const q = { contains: sp.q, mode: "insensitive" as const };
    and.push({ OR: [{ title: q }, { description: q }, { indicator: q }, { targetText: q }, { externalRef: { equals: sp.q.trim(), mode: "insensitive" } }] });
  }
  return and.length ? { AND: and } : {};
}
