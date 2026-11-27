import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { RISK_STATUS_LABEL, RISK_TYPE_LABEL, TREATMENT_STATUS_LABEL } from "@/lib/labels";
import { PRIORITY_LABEL, RISK_LEVEL_LABEL, riskDisplayCode, riskLevel, riskPriority } from "@/lib/risk";
import { riskWhere, type RiskSearch } from "@/lib/risk-filters";
import { csvResponse, toCsv } from "@/lib/csv";
import { formatDate } from "@/lib/format";

/**
 * Export van het risico- en kansenregister als CSV (opent in Excel), met dezelfde filters als het overzicht.
 * De kolommen volgen het eigen register van Rouwmaat, zodat een export direct weer te importeren is.
 */
export async function GET(request: Request) {
  const user = await requireUser();
  const sp = Object.fromEntries(new URL(request.url).searchParams) as RiskSearch;
  const risks = await prisma.risk.findMany({
    where: riskWhere(sp),
    orderBy: [{ type: "asc" }, { externalRef: "asc" }, { number: "asc" }],
    include: {
      owner: { select: { name: true } },
      disciplines: { select: { name: true }, orderBy: { sortOrder: "asc" } },
      location: { select: { name: true } },
      processes: { select: { name: true } },
      requirements: { select: { clause: true, norm: { select: { code: true } } } },
      _count: { select: { actions: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } } } } },
    },
  });

  const header = [
    "Nr.",
    "Soort",
    "Omschrijving",
    "Herkomst",
    "Prioriteit",
    "Contextfactor",
    "Thema",
    "BU",
    "Oorzaak / context",
    "Gevolg",
    "Kans",
    "Effect",
    "Score",
    "Niveau",
    "Beheersmaatregel",
    "Eigenaar",
    "Termijn",
    "Status",
    "Monitoring / KPI",
    "Kader",
    "Restkans",
    "Resteffect",
    "Restscore",
    "Laatst beoordeeld",
    "Opmerking",
    "Volgende beoordeling",
    "Status risico",
    "Locatie",
    "Processen",
    "Normeisen",
    "Open acties",
  ];
  const rows = risks
    .sort((a, b) => riskDisplayCode(a).localeCompare(riskDisplayCode(b), "nl", { numeric: true }))
    .map((r) => {
      const before = r.likelihoodBefore * r.impactBefore;
      const after = r.likelihoodAfter && r.impactAfter ? r.likelihoodAfter * r.impactAfter : null;
      return [
        riskDisplayCode(r),
        RISK_TYPE_LABEL[r.type],
        r.title,
        r.origin,
        PRIORITY_LABEL[riskPriority(r)],
        r.contextFactor,
        r.theme,
        r.disciplines.length ? r.disciplines.map((d) => d.name).join(", ") : "Groep",
        r.cause,
        r.consequence,
        r.likelihoodBefore,
        r.impactBefore,
        before,
        RISK_LEVEL_LABEL[riskLevel(before)],
        r.measures,
        r.ownerText ?? r.owner?.name ?? "",
        r.term,
        TREATMENT_STATUS_LABEL[r.treatmentStatus],
        r.monitoring,
        r.framework,
        r.likelihoodAfter,
        r.impactAfter,
        after,
        r.lastReviewedAt ? formatDate(r.lastReviewedAt) : "",
        r.notes,
        r.reviewDate ? formatDate(r.reviewDate) : "",
        RISK_STATUS_LABEL[r.status],
        r.location?.name ?? "",
        r.processes.map((p) => p.name).join(", "),
        r.requirements.map((q) => `${q.norm.code} ${q.clause}`).join(", "),
        r._count.actions,
      ];
    });

  await logAudit({ user, action: "VIEW", entityType: "Risk", summary: `Risico- en kansenregister geëxporteerd (${risks.length} regels)` });
  return csvResponse(toCsv([header, ...rows]), `risico-en-kansenregister-${new Date().toISOString().slice(0, 10)}.csv`);
}
