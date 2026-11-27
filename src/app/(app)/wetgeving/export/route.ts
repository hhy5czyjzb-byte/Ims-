import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { APPLICABILITY_LABEL, COMPLIANCE_STATUS_LABEL, IMPACT_LEVEL_LABEL, IMPLEMENTATION_STATUS_LABEL, LEGAL_CATEGORY_LABEL } from "@/lib/labels";
import { riskDisplayCode } from "@/lib/risk";
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
    orderBy: [{ externalRef: "asc" }, { title: "asc" }, { article: "asc" }, { number: "asc" }],
    include: {
      owner: { select: { name: true } },
      discipline: { select: { name: true } },
      location: { select: { name: true } },
      norms: { select: { code: true } },
      risks: { select: { externalRef: true, number: true, type: true } },
      requirements: { select: { clause: true, norm: { select: { code: true } } } },
      _count: { select: { actions: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } } } } },
    },
  });
  const yes = (r: { norms: { code: string }[] }, code: string) => (r.norms.some((n) => n.code === code) ? "✓" : "");
  const header = [
    "Nr.",
    "Thema",
    "Wet of regelgeving",
    "Artikel",
    "Categorie",
    "Toepassing bij Rouwmaat",
    "Van toepassing",
    "ISO 14001",
    "CO2 PL",
    "VCA / Arbo",
    "ISO 9001",
    "Kernverplichtingen",
    "Bewijslast",
    "Eigenaar en frequentie",
    "Status",
    "Compliancebeoordeling",
    "Toelichting / actie",
    "Volgende stap",
    "Impact",
    "Laatste controle",
    "Volgende controle",
    "Risicoregister",
    "Herkomst",
    "Bevoegd gezag",
    "Bron",
    "Discipline",
    "Locatie",
    "Code IMS",
    "Normeisen",
    "Open acties",
    "Actief",
  ];
  const rows = reqs.map((r) => [
    r.externalRef,
    r.theme ?? LEGAL_CATEGORY_LABEL[r.category],
    r.title,
    r.article,
    r.regulationType,
    r.subject,
    APPLICABILITY_LABEL[r.applicability],
    yes(r, "ISO 14001"),
    yes(r, "CO2-prestatieladder"),
    yes(r, "VCA**"),
    yes(r, "ISO 9001"),
    r.description,
    r.evidence,
    r.ownerText ?? r.owner?.name ?? "",
    r.implementationStatus ? IMPLEMENTATION_STATUS_LABEL[r.implementationStatus] : "",
    COMPLIANCE_STATUS_LABEL[r.status],
    r.explanation,
    r.nextStep,
    r.impact ? IMPACT_LEVEL_LABEL[r.impact] : "",
    r.lastReviewDate ? formatDate(r.lastReviewDate) : "",
    r.nextReviewDate ? formatDate(r.nextReviewDate) : "",
    r.risks
      .map((k) => riskDisplayCode(k))
      .sort()
      .join(", "),
    r.origin,
    r.source,
    r.sourceUrl,
    r.discipline?.name ?? "",
    r.location?.name ?? "",
    legalCode(r.number),
    r.requirements.map((q) => `${q.norm.code} ${q.clause}`).join(", "),
    r._count.actions,
    r.active ? "ja" : "nee",
  ]);
  await logAudit({ user, action: "VIEW", entityType: "LegalRequirement", summary: `Register wet- en regelgeving geëxporteerd (${reqs.length} regels)` });
  return csvResponse(toCsv([header, ...rows]), `register-wet-en-regelgeving-${new Date().toISOString().slice(0, 10)}.csv`);
}
