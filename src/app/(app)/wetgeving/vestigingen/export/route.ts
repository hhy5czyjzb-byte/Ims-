import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { COMPLIANCE_STATUS_LABEL } from "@/lib/labels";
import { csvResponse, toCsv } from "@/lib/csv";
import { formatDate } from "@/lib/format";
import { locationAuditCode } from "@/lib/location-audit";

/**
 * Export in de kolommen van het tabblad Compliance-audit (direct weer te importeren).
 * Standaard de laatste (niet geannuleerde) audit per vestiging; met ?audit=<id> één audit.
 */
export async function GET(request: Request) {
  const user = await requireUser();
  const auditId = new URL(request.url).searchParams.get("audit");
  const all = await prisma.locationAudit.findMany({
    where: auditId ? { id: auditId } : { status: { not: "CANCELLED" } },
    orderBy: [{ date: "desc" }, { number: "desc" }],
    include: {
      location: { select: { name: true, sortOrder: true } },
      auditor: { select: { name: true } },
      answers: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          legalRequirement: { select: { externalRef: true, title: true } },
          actions: { select: { number: true, title: true, deadline: true, owner: { select: { name: true } } }, orderBy: { number: "asc" } },
        },
      },
    },
  });
  const seen = new Set<string>();
  const audits = all
    .filter((a) => (seen.has(a.locationId) ? false : (seen.add(a.locationId), true)))
    .sort((a, b) => a.location.sortOrder - b.location.sortOrder || a.location.name.localeCompare(b.location.name, "nl"));

  const header = [
    "Vestiging",
    "Nr.",
    "Verplichting",
    "Thema",
    "Auditvraag",
    "Bewijs om te bekijken",
    "Oordeel",
    "Bevinding",
    "Actie",
    "Eigenaar actie",
    "Termijn",
    "Datum audit",
    "Auditor",
    "Code audit",
  ];
  const rows = audits.flatMap((a) =>
    a.answers.map((q) => [
      a.location.name,
      q.legalRequirement?.externalRef ?? "",
      q.legalRequirement?.title ?? "",
      q.theme,
      q.questionText,
      q.evidenceHint,
      q.verdict === "NOT_ASSESSED" ? "" : COMPLIANCE_STATUS_LABEL[q.verdict],
      q.finding,
      q.actions.map((x) => `#${x.number} ${x.title}`).join("; "),
      q.actions
        .map((x) => x.owner?.name ?? "")
        .filter(Boolean)
        .join("; "),
      q.actions
        .map((x) => (x.deadline ? formatDate(x.deadline) : ""))
        .filter(Boolean)
        .join("; "),
      formatDate(a.date),
      a.auditor?.name ?? a.auditorText ?? "",
      locationAuditCode(a.number),
    ]),
  );
  await logAudit({ user, action: "VIEW", entityType: "LocationAudit", summary: `Compliance-audit geëxporteerd (${audits.length} audit(s))` });
  return csvResponse(toCsv([header, ...rows]), `compliance-audit-vestigingen-${new Date().toISOString().slice(0, 10)}.csv`);
}
