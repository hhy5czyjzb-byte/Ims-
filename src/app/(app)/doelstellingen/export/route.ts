import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { objectiveWhere, type ObjectiveSearch } from "@/lib/objective-filters";
import { objectiveDisplayCode } from "@/lib/objectives";
import { OBJECTIVE_CATEGORY_LABEL, OBJECTIVE_STATUS_LABEL } from "@/lib/labels";
import { csvResponse, toCsv } from "@/lib/csv";
import { formatDate } from "@/lib/format";

/** Export van de doelstellingen (zelfde filters als het overzicht); kolommen direct weer te importeren. */
export async function GET(request: Request) {
  const user = await requireUser();
  const sp = Object.fromEntries(new URL(request.url).searchParams) as ObjectiveSearch;
  const list = await prisma.objective.findMany({
    where: objectiveWhere(sp, user.id),
    orderBy: [{ category: "asc" }, { number: "asc" }],
    include: {
      owner: { select: { name: true } },
      discipline: { select: { name: true } },
      norms: { select: { code: true } },
      reviews: { orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 1 },
    },
  });
  const header = [
    "Nr.",
    "Doelstelling",
    "Categorie",
    "Indicator",
    "Nulmeting",
    "Streefwaarde",
    "Eigenaar",
    "Termijn",
    "Bedrijfsonderdeel",
    "Normen",
    "Status",
    "Toelichting status",
    "Laatst beoordeeld",
    "Volgende beoordeling",
  ];
  const rows = list.map((o) => [
    objectiveDisplayCode(o),
    o.title,
    OBJECTIVE_CATEGORY_LABEL[o.category],
    o.indicator ?? "",
    o.baselineText ?? (o.baselineValue !== null ? String(o.baselineValue).replace(".", ",") : ""),
    o.targetText ?? (o.targetValue !== null ? String(o.targetValue).replace(".", ",") : ""),
    o.owner?.name ?? o.ownerText ?? "",
    o.deadline ? formatDate(o.deadline) : (o.termText ?? ""),
    o.discipline?.name ?? "",
    o.norms.map((n) => n.code).join(", "),
    OBJECTIVE_STATUS_LABEL[o.status],
    o.reviews[0]?.explanation ?? "",
    o.lastReviewDate ? formatDate(o.lastReviewDate) : "",
    o.nextReviewDate ? formatDate(o.nextReviewDate) : "",
  ]);
  await logAudit({ user, action: "VIEW", entityType: "Objective", summary: `Doelstellingen geëxporteerd (${list.length} regels)` });
  return csvResponse(toCsv([header, ...rows]), `doelstellingen-${new Date().toISOString().slice(0, 10)}.csv`);
}
