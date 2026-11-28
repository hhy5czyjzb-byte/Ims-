import type { Prisma, ReportOrigin, ReportStatus, ReportType } from "@prisma/client";
import { REPORT_ORIGIN_LABEL, REPORT_STATUS_LABEL, REPORT_TYPE_LABEL } from "@/lib/labels";
import { REPORT_GROUPS } from "@/lib/reports";

export type ReportSearch = {
  q?: string;
  soort?: string;
  status?: string;
  herkomst?: string;
  discipline?: string;
  locatie?: string;
  jaar?: string;
  audit?: string;
  groep?: string; // incidenten / klachten / afwijkingen / verbetering (zie REPORT_GROUPS)
  verzuim?: string; // kort (1–15 dagen) / lang (> 15 dagen) / ja (beide)
  categorie?: string; // categorie ongeval
  meldplichtig?: string; // "ja"
  fataal?: string; // "ja"
};

/** Filters van de meldingen (gedeeld door overzicht en export). soort "AUDIT" = alleen auditbevindingen (geen meldingen). */
export function reportWhere(sp: ReportSearch): Prisma.ReportWhereInput {
  const and: Prisma.ReportWhereInput[] = [];
  const status = sp.status ?? "lopend";
  if (status === "lopend") and.push({ status: { in: ["NEW", "IN_PROGRESS"] } });
  else if (status in REPORT_STATUS_LABEL) and.push({ status: status as ReportStatus });
  if (sp.soort === "veiligheid") and.push({ type: { in: ["ACCIDENT", "NEAR_MISS", "UNSAFE_SITUATION"] } });
  else if (sp.soort && sp.soort in REPORT_TYPE_LABEL) and.push({ type: sp.soort as ReportType });
  else if (sp.soort === "AUDIT") and.push({ id: "__geen__" });
  const group = REPORT_GROUPS.find((g) => g.key === sp.groep && g.types.length);
  if (group) and.push({ type: { in: group.types } });
  if (sp.verzuim === "kort") and.push({ absence: "SHORT" });
  else if (sp.verzuim === "lang") and.push({ absence: "LONG" });
  else if (sp.verzuim === "ja") and.push({ absence: { not: null } });
  if (sp.meldplichtig === "ja") and.push({ reportable: true });
  if (sp.fataal === "ja") and.push({ injury: "FATAL" });
  if (sp.categorie) and.push({ accidentCategory: sp.categorie });
  if (sp.herkomst && sp.herkomst in REPORT_ORIGIN_LABEL) and.push({ origin: sp.herkomst as ReportOrigin });
  if (sp.discipline) and.push({ disciplineId: sp.discipline });
  if (sp.locatie) and.push({ locationId: sp.locatie });
  const year = Number(sp.jaar);
  if (Number.isInteger(year) && year > 2000 && year < 2100)
    and.push({ occurredAt: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } });
  if (sp.q) {
    const q = { contains: sp.q, mode: "insensitive" as const };
    and.push({ OR: [{ title: q }, { description: q }, { locationText: q }, { externalRef: { equals: sp.q.trim(), mode: "insensitive" } }] });
  }
  return and.length ? { AND: and } : {};
}
