import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { COMPLIANCE_STATUS_LABEL, LEGAL_CATEGORY_LABEL } from "@/lib/labels";
import { legalCode } from "@/lib/compliance";
import { legalWhere, type LegalSearch } from "@/lib/legal-filters";
import { csvResponse, toCsv } from "@/lib/csv";
import { formatDate } from "@/lib/format";

/** Export van het register als CSV (opent in Excel), met dezelfde filters als het overzicht. Kolommen sluiten aan op de import. */
export async function GET(request: Request) {
  const user = await requireUser();
  const sp = Object.fromEntries(new URL(request.url).searchParams) as LegalSearch;
  const reqs = await prisma.legalRequirement.findMany({
    where: legalWhere(sp, user.id),
    orderBy: [{ title: "asc" }, { article: "asc" }, { number: "asc" }],
    include: {
      owner: { select: { name: true } },
      discipline: { select: { name: true } },
      location: { select: { name: true } },
      requirements: { select: { clause: true, norm: { select: { code: true } } } },
      _count: { select: { actions: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } } } } },
    },
  });
  const header = [
    "Code",
    "Kenmerk",
    "Wet / regeling",
    "Artikel",
    "Onderwerp",
    "Eis",
    "Bevoegd gezag",
    "Link",
    "Categorie",
    "Discipline",
    "Locatie",
    "Eigenaar",
    "Compliancestatus",
    "Toelichting",
    "Datum laatste toetsing",
    "Volgende toetsing",
    "Normeisen",
    "Open acties",
    "Actief",
  ];
  const rows = reqs.map((r) => [
    legalCode(r.number),
    r.externalRef,
    r.title,
    r.article,
    r.subject,
    r.description,
    r.source,
    r.sourceUrl,
    LEGAL_CATEGORY_LABEL[r.category],
    r.discipline?.name ?? "",
    r.location?.name ?? "",
    r.owner?.name ?? "",
    COMPLIANCE_STATUS_LABEL[r.status],
    r.explanation,
    r.lastReviewDate ? formatDate(r.lastReviewDate) : "",
    r.nextReviewDate ? formatDate(r.nextReviewDate) : "",
    r.requirements.map((q) => `${q.norm.code} ${q.clause}`).join(", "),
    r._count.actions,
    r.active ? "ja" : "nee",
  ]);
  await logAudit({ user, action: "VIEW", entityType: "LegalRequirement", summary: `Register wet- en regelgeving geëxporteerd (${reqs.length} regels)` });
  return csvResponse(toCsv([header, ...rows]), `register-wet-en-regelgeving-${new Date().toISOString().slice(0, 10)}.csv`);
}
