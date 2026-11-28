import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { reportCode } from "@/lib/reports";
import { reportWhere, type ReportSearch } from "@/lib/report-filters";
import { INJURY_LEVEL_LABEL, REPORT_ORIGIN_LABEL, REPORT_SEVERITY_LABEL, REPORT_STATUS_LABEL, REPORT_TYPE_LABEL } from "@/lib/labels";
import { csvResponse, toCsv } from "@/lib/csv";
import { formatDate } from "@/lib/format";

/** Export van de meldingen (zelfde filters als het overzicht); kolommen direct weer te importeren. */
export async function GET(request: Request) {
  const user = await requireUser();
  const sp = Object.fromEntries(new URL(request.url).searchParams) as ReportSearch;
  const reports = await prisma.report.findMany({
    where: reportWhere(sp),
    orderBy: [{ occurredAt: "desc" }, { number: "desc" }],
    include: {
      location: { select: { name: true } },
      discipline: { select: { name: true } },
      owner: { select: { name: true } },
      reportedBy: { select: { name: true } },
      actions: { select: { status: true } },
    },
  });
  const header = [
    "Nr.",
    "Soort",
    "Datum voorval",
    "Omschrijving",
    "Toelichting",
    "Herkomst",
    "Locatie",
    "Bedrijfsonderdeel",
    "Melder",
    "Ernst",
    "Letsel",
    "Verzuimdagen",
    "Meldplichtig",
    "Directe maatregel",
    "Oorzaak",
    "Behandelaar",
    "Status",
    "Effectief",
    "Afgesloten op",
    "Acties",
    "Acties open",
    "Code IMS",
  ];
  const rows = reports.map((r) => [
    r.externalRef ?? reportCode(r.number),
    REPORT_TYPE_LABEL[r.type],
    formatDate(r.occurredAt),
    r.title,
    r.description,
    REPORT_ORIGIN_LABEL[r.origin],
    r.location?.name ?? r.locationText ?? "",
    r.discipline?.name ?? "",
    r.reporterText ?? r.reportedBy?.name ?? "",
    r.severity ? REPORT_SEVERITY_LABEL[r.severity] : "",
    r.injury ? INJURY_LEVEL_LABEL[r.injury] : "",
    r.lostDays ?? "",
    r.reportable ? "ja" : "nee",
    r.immediateAction,
    r.rootCause,
    r.owner?.name ?? r.ownerText ?? "",
    REPORT_STATUS_LABEL[r.status],
    r.effective === null ? "" : r.effective ? "ja" : "nee",
    r.closedAt ? formatDate(r.closedAt) : "",
    r.actions.length,
    r.actions.filter((a) => a.status === "OPEN" || a.status === "IN_PROGRESS").length,
    reportCode(r.number),
  ]);
  await logAudit({ user, action: "VIEW", entityType: "Report", summary: `Meldingen geëxporteerd (${reports.length} regels)` });
  return csvResponse(toCsv([header, ...rows]), `meldingen-${new Date().toISOString().slice(0, 10)}.csv`);
}
