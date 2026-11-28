import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { actionOrigin } from "@/lib/action-origin";
import { actionOriginInclude, actionWhere, type ActionSearch } from "@/lib/action-filters";
import { ACTION_KIND_LABEL, ACTION_PRIORITY_LABEL, ACTION_SOURCE_LABEL, ACTION_STATUS_LABEL } from "@/lib/labels";
import { csvResponse, toCsv } from "@/lib/csv";
import { formatDate } from "@/lib/format";

/** Export van de actielijst (zelfde filters als het overzicht); kolommen direct weer te importeren. */
export async function GET(request: Request) {
  const user = await requireUser();
  const sp = Object.fromEntries(new URL(request.url).searchParams) as ActionSearch;
  const actions = await prisma.action.findMany({
    where: actionWhere(sp, user.id),
    orderBy: [{ deadline: { sort: "asc", nulls: "last" } }, { number: "desc" }],
    include: { owner: { select: { name: true } }, discipline: { select: { name: true } }, location: { select: { name: true } }, ...actionOriginInclude },
  });
  const header = [
    "Nr.",
    "Actie",
    "Toelichting",
    "Bron",
    "Herkomst",
    "Soort",
    "Eigenaar",
    "Deadline",
    "Status",
    "Prioriteit",
    "Bedrijfsonderdeel",
    "Vestiging",
    "Resultaat",
    "Gereed op",
    "Effectiviteit",
    "Melding",
  ];
  const rows = actions.map((a) => {
    const origin = actionOrigin(a);
    return [
      a.externalRef ?? `#${a.number}`,
      a.title,
      a.description,
      ACTION_SOURCE_LABEL[a.source],
      origin?.code ?? "",
      ACTION_KIND_LABEL[a.kind],
      a.owner?.name ?? a.ownerText ?? "",
      a.deadline ? formatDate(a.deadline) : "",
      ACTION_STATUS_LABEL[a.status],
      ACTION_PRIORITY_LABEL[a.priority],
      a.discipline?.name ?? "",
      a.location?.name ?? "",
      a.result,
      a.completedAt ? formatDate(a.completedAt) : "",
      a.verificationNote ?? (a.verifiedAt ? `gecontroleerd ${formatDate(a.verifiedAt)}` : ""),
      a.report ? origin?.code : "",
    ];
  });
  await logAudit({ user, action: "VIEW", entityType: "Action", summary: `Actielijst geëxporteerd (${actions.length} regels)` });
  return csvResponse(toCsv([header, ...rows]), `actielijst-${new Date().toISOString().slice(0, 10)}.csv`);
}
