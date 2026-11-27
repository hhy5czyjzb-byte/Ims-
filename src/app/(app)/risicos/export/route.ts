import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { RISK_CATEGORY_LABEL, RISK_STATUS_LABEL, RISK_TYPE_LABEL } from "@/lib/labels";
import { residual, RISK_LEVEL_LABEL, riskCode, riskLevel } from "@/lib/risk";
import { csvField, riskWhere, type RiskSearch } from "@/lib/risk-filters";
import { formatDate } from "@/lib/format";

/** Export van het risicoregister als CSV (opent direct in Excel), met dezelfde filters als het overzicht. */
export async function GET(request: Request) {
  const user = await requireUser();
  const sp = Object.fromEntries(new URL(request.url).searchParams) as RiskSearch;
  const risks = await prisma.risk.findMany({
    where: riskWhere(sp),
    orderBy: [{ type: "asc" }, { number: "asc" }],
    include: {
      owner: { select: { name: true } },
      discipline: { select: { name: true } },
      location: { select: { name: true } },
      processes: { select: { name: true } },
      requirements: { select: { clause: true, norm: { select: { code: true } } } },
      _count: { select: { actions: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } } } } },
    },
  });

  const header = [
    "Code",
    "Soort",
    "Categorie",
    "Titel",
    "Omschrijving",
    "Oorzaak",
    "Gevolg",
    "Beheersmaatregelen",
    "Kans vóór",
    "Effect vóór",
    "Score vóór",
    "Klasse vóór",
    "Kans na",
    "Effect na",
    "Score na",
    "Klasse na",
    "Status",
    "Eigenaar",
    "Discipline",
    "Locatie",
    "Processen",
    "Normeisen",
    "Open acties",
    "Volgende beoordeling",
  ];
  const rows = risks.map((r) => {
    const before = r.likelihoodBefore * r.impactBefore;
    const res = residual(r);
    return [
      riskCode(r.number, r.type),
      RISK_TYPE_LABEL[r.type],
      RISK_CATEGORY_LABEL[r.category],
      r.title,
      r.description,
      r.cause,
      r.consequence,
      r.measures,
      r.likelihoodBefore,
      r.impactBefore,
      before,
      RISK_LEVEL_LABEL[riskLevel(before)],
      r.likelihoodAfter,
      r.impactAfter,
      res.assessed ? res.score : "",
      res.assessed ? RISK_LEVEL_LABEL[riskLevel(res.score)] : "",
      RISK_STATUS_LABEL[r.status],
      r.owner?.name,
      r.discipline?.name ?? "Bedrijfsbreed",
      r.location?.name ?? "Alle locaties",
      r.processes.map((p) => p.name).join(", "),
      r.requirements.map((q) => `${q.norm.code} ${q.clause}`).join(", "),
      r._count.actions,
      r.reviewDate ? formatDate(r.reviewDate) : "",
    ];
  });
  const csv = "﻿" + [header, ...rows].map((row) => row.map(csvField).join(";")).join("\r\n");

  await logAudit({ user, action: "VIEW", entityType: "Risk", summary: `Risicoregister geëxporteerd (${risks.length} regels)` });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="risicoregister-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
