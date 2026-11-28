import type { Prisma, RiskCategory, RiskStatus, RiskType, TreatmentStatus } from "@prisma/client";
import { RISK_CATEGORY_LABEL, RISK_STATUS_LABEL, TREATMENT_STATUS_LABEL } from "@/lib/labels";

/** Zoekparameters van het risicoregister (gedeeld door overzicht en export). */
export type RiskSearch = {
  q?: string;
  soort?: string;
  categorie?: string;
  status?: string;
  discipline?: string;
  locatie?: string;
  proces?: string;
  norm?: string;
  klasse?: string;
  prioriteit?: string;
  aanpak?: string;
  herkomst?: string;
  context?: string; // contextfactor (naam)
  cel?: string;
  basis?: string;
};

export function riskWhere(sp: RiskSearch): Prisma.RiskWhereInput {
  const status = sp.status ?? "actief";
  return {
    ...(sp.q
      ? {
          OR: [
            { title: { contains: sp.q, mode: "insensitive" } },
            { description: { contains: sp.q, mode: "insensitive" } },
            { externalRef: { equals: sp.q.trim(), mode: "insensitive" } },
            { theme: { contains: sp.q, mode: "insensitive" } },
            { ownerText: { contains: sp.q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(sp.soort === "RISK" || sp.soort === "OPPORTUNITY" ? { type: sp.soort as RiskType } : {}),
    ...(sp.categorie && sp.categorie in RISK_CATEGORY_LABEL ? { category: sp.categorie as RiskCategory } : {}),
    ...(status === "actief" ? { status: { not: "CLOSED" } } : status in RISK_STATUS_LABEL ? { status: status as RiskStatus } : {}),
    ...(sp.discipline ? { disciplines: { some: { id: sp.discipline } } } : {}),
    ...(sp.aanpak && sp.aanpak in TREATMENT_STATUS_LABEL ? { treatmentStatus: sp.aanpak as TreatmentStatus } : {}),
    ...(sp.herkomst ? { origin: sp.herkomst } : {}),
    ...(sp.context ? { contextFactor: sp.context } : {}),
    ...(sp.prioriteit === "1" ? { strategic: true } : sp.prioriteit === "2" || sp.prioriteit === "3" ? { strategic: false } : {}),
    ...(sp.locatie ? { locationId: sp.locatie } : {}),
    ...(sp.proces ? { processes: { some: { id: sp.proces } } } : {}),
    ...(sp.norm ? { requirements: { some: { normId: sp.norm } } } : {}),
  };
}

export { csvField } from "@/lib/csv";
