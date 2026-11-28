import type { ActionKind, ActionPriority, ActionSource, ActionStatus, Prisma } from "@prisma/client";
import { ACTION_KIND_LABEL, ACTION_PRIORITY_LABEL, ACTION_SOURCE_LABEL, ACTION_STATUS_LABEL } from "@/lib/labels";

export type ActionSearch = {
  q?: string;
  status?: string; // lopend (standaard) / verlopen / week / alle / OPEN / …
  bron?: string;
  soort?: string;
  prio?: string;
  eigenaar?: string; // mij / user-id / "geen"
  discipline?: string;
  locatie?: string;
  oorzaak?: string; // "geen" = zonder oorzaak (root cause)
  tab?: string;
};

const startOfToday = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

/** Filters van de actielijst (gedeeld door overzicht en export); voorwaarden in AND. */
export function actionWhere(sp: ActionSearch, userId: string, now = new Date()): Prisma.ActionWhereInput {
  const and: Prisma.ActionWhereInput[] = [];
  const today = startOfToday(now);
  const status = sp.status ?? "lopend";
  const running: Prisma.ActionWhereInput = { status: { in: ["OPEN", "IN_PROGRESS"] } };
  if (status === "lopend") and.push(running);
  else if (status === "verlopen") and.push(running, { deadline: { lt: today } });
  else if (status === "week") and.push(running, { deadline: { gte: today, lt: new Date(today.getTime() + 7 * 86_400_000) } });
  else if (status in ACTION_STATUS_LABEL) and.push({ status: status as ActionStatus });
  if (sp.q) {
    const q = { contains: sp.q, mode: "insensitive" as const };
    const n = Number(sp.q.replace(/^#/, ""));
    and.push({
      OR: [
        { title: q },
        { description: q },
        { ownerText: q },
        { externalRef: { equals: sp.q.trim(), mode: "insensitive" } },
        ...(Number.isInteger(n) && n > 0 ? [{ number: n }] : []),
      ],
    });
  }
  if (sp.bron && sp.bron in ACTION_SOURCE_LABEL) and.push({ source: sp.bron as ActionSource });
  if (sp.soort && sp.soort in ACTION_KIND_LABEL) and.push({ kind: sp.soort as ActionKind });
  if (sp.prio && sp.prio in ACTION_PRIORITY_LABEL) and.push({ priority: sp.prio as ActionPriority });
  if (sp.eigenaar === "mij") and.push({ ownerId: userId });
  else if (sp.eigenaar === "geen") and.push({ ownerId: null, ownerText: null });
  else if (sp.eigenaar) and.push({ ownerId: sp.eigenaar });
  if (sp.discipline) and.push({ disciplineId: sp.discipline });
  if (sp.locatie) and.push({ locationId: sp.locatie });
  if (sp.oorzaak === "geen") and.push({ OR: [{ rootCause: null }, { rootCause: "" }] });
  return and.length ? { AND: and } : {};
}

/** Herkomst als code + link (melding, auditbevinding, risico, …), voor in de lijst. */
export const actionOriginInclude = {
  report: { select: { id: true, number: true, externalRef: true, type: true } },
  finding: { select: { id: true, number: true, auditId: true, audit: { select: { number: true } } } },
  risk: { select: { id: true, number: true, externalRef: true, type: true } },
  legalRequirement: { select: { id: true, number: true, externalRef: true } },
  environmentalAspect: { select: { id: true, number: true, externalRef: true } },
  reductionTarget: { select: { id: true, title: true } },
  managementReview: { select: { id: true, year: true } },
  objective: { select: { id: true, number: true, externalRef: true } },
  locationAuditAnswer: { select: { auditId: true, audit: { select: { number: true } } } },
} as const;
