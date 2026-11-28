import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { CO2_SETTINGS_KEY } from "@/lib/co2-settings";

/** Onderdelen van de CO2-prestatieladder in de audit trail. */
export const CO2_ENTITY_LABEL: Record<string, string> = {
  EnergyCarrier: "Energiedrager",
  EmissionFactor: "Emissiefactor",
  EnergyConsumption: "Verbruik",
  Equipment: "Materieel",
  ReductionTarget: "Doelstelling",
  Co2Organisation: "Organisatie",
  Co2Kpi: "Kengetal",
  DataQualityItem: "DKMP",
  FleetCount: "Wagenpark",
  Action: "Maatregel (plan van aanpak)",
  AppSetting: "Instellingen",
};
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  CREATE: "Toegevoegd",
  UPDATE: "Gewijzigd",
  DELETE: "Verwijderd",
  VIEW: "Bekeken",
  SYNC: "Gesynchroniseerd",
  LOGIN: "Ingelogd",
};

export type Co2AuditSearch = { onderdeel?: string; actie?: string; van?: string; tot?: string; q?: string; bekeken?: string };

/** Filter voor de CO2-audit trail; maatregelen = acties met bron CO2-reductie. */
export async function co2AuditWhere(sp: Co2AuditSearch): Promise<Prisma.AuditLogWhereInput> {
  const measureIds = (await prisma.action.findMany({ where: { source: "CO2_REDUCTION" }, select: { id: true } })).map((a) => a.id);
  const scope: Prisma.AuditLogWhereInput = {
    OR: [
      { entityType: { in: Object.keys(CO2_ENTITY_LABEL).filter((k) => k !== "Action" && k !== "AppSetting") } },
      { entityType: "AppSetting", entityId: CO2_SETTINGS_KEY },
      { entityType: "Action", entityId: { in: measureIds } },
      { entityType: "Action", summary: { contains: "plan van aanpak", mode: "insensitive" } },
    ],
  };
  const and: Prisma.AuditLogWhereInput[] = [scope];
  if (sp.onderdeel && sp.onderdeel in CO2_ENTITY_LABEL) and.push({ entityType: sp.onderdeel });
  if (sp.actie && sp.actie in AUDIT_ACTION_LABEL) and.push({ action: sp.actie });
  else if (sp.bekeken !== "ja") and.push({ action: { not: "VIEW" } });
  const d = (v?: string, end = false) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T${end ? "23:59:59" : "00:00:00"}Z`) : null);
  const from = d(sp.van);
  const to = d(sp.tot, true);
  if (from) and.push({ createdAt: { gte: from } });
  if (to) and.push({ createdAt: { lte: to } });
  if (sp.q)
    and.push({
      OR: [
        { summary: { contains: sp.q, mode: "insensitive" } },
        { userEmail: { contains: sp.q, mode: "insensitive" } },
        { user: { name: { contains: sp.q, mode: "insensitive" } } },
      ],
    });
  return { AND: and };
}
