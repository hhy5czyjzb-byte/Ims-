import type { ComplianceStatus, LegalCategory, Prisma } from "@prisma/client";
import { COMPLIANCE_STATUS_LABEL, LEGAL_CATEGORY_LABEL } from "@/lib/labels";

export type LegalSearch = {
  q?: string;
  status?: string;
  categorie?: string;
  discipline?: string;
  locatie?: string;
  eigenaar?: string;
  toetsing?: string;
  actief?: string;
};

/**
 * Filters van het register wet- en regelgeving (gedeeld door overzicht en export).
 * Elke filter is een aparte voorwaarde in AND, zodat filters op hetzelfde veld elkaar niet overschrijven.
 */
export function legalWhere(sp: LegalSearch, userId: string, now = new Date()): Prisma.LegalRequirementWhereInput {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const in30 = new Date(today.getTime() + 30 * 86_400_000);
  const and: Prisma.LegalRequirementWhereInput[] = [];

  if (sp.actief === "nee") and.push({ active: false });
  else if (sp.actief !== "alle") and.push({ active: true });

  if (sp.q) {
    and.push({
      OR: [
        { title: { contains: sp.q, mode: "insensitive" } },
        { article: { contains: sp.q, mode: "insensitive" } },
        { subject: { contains: sp.q, mode: "insensitive" } },
        { description: { contains: sp.q, mode: "insensitive" } },
        { externalRef: { contains: sp.q, mode: "insensitive" } },
      ],
    });
  }
  if (sp.status === "actie") and.push({ status: { in: ["NON_COMPLIANT", "PARTIAL"] } });
  else if (sp.status && sp.status in COMPLIANCE_STATUS_LABEL) and.push({ status: sp.status as ComplianceStatus });
  if (sp.categorie && sp.categorie in LEGAL_CATEGORY_LABEL) and.push({ category: sp.categorie as LegalCategory });
  if (sp.discipline) and.push({ disciplineId: sp.discipline });
  if (sp.locatie) and.push({ locationId: sp.locatie });
  if (sp.eigenaar === "mij") and.push({ ownerId: userId });
  else if (sp.eigenaar) and.push({ ownerId: sp.eigenaar });
  if (sp.toetsing === "verlopen") and.push({ nextReviewDate: { lt: today } }, { status: { not: "NOT_APPLICABLE" } });
  else if (sp.toetsing === "30dagen") and.push({ nextReviewDate: { gte: today, lte: in30 } }, { status: { not: "NOT_APPLICABLE" } });
  else if (sp.toetsing === "nooit") and.push({ lastReviewDate: null });

  return and.length ? { AND: and } : {};
}
