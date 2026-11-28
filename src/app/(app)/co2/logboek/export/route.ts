import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { readChanges } from "@/lib/audit-diff";
import { AUDIT_ACTION_LABEL, CO2_ENTITY_LABEL, co2AuditWhere, type Co2AuditSearch } from "@/lib/co2-audit";
import { csvResponse, toCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/format";

/** Export van de CO2-audit trail (zelfde filters als het logboek). */
export async function GET(request: Request) {
  const user = await requireUser();
  if (!can(user.role, "auditlog.view") && !can(user.role, "co2.manage")) return new Response("Geen toegang", { status: 403 });
  const sp = Object.fromEntries(new URL(request.url).searchParams) as Co2AuditSearch;
  const rows = await prisma.auditLog.findMany({
    where: await co2AuditWhere(sp),
    orderBy: { createdAt: "desc" },
    take: 20000,
    include: { user: { select: { name: true } } },
  });
  const header = ["Wanneer", "Wie", "Onderdeel", "Handeling", "Omschrijving", "Wijzigingen (oud → nieuw)"];
  const data = rows.map((r) => [
    formatDateTime(r.createdAt),
    r.user?.name ?? r.userEmail ?? "Systeem",
    CO2_ENTITY_LABEL[r.entityType] ?? r.entityType,
    AUDIT_ACTION_LABEL[r.action] ?? r.action,
    r.summary ?? "",
    readChanges(r.details)
      .map((c) => `${c.label}: ${c.from} → ${c.to}`)
      .join("; "),
  ]);
  await logAudit({ user, action: "VIEW", entityType: "AuditLog", summary: `CO2-logboek geëxporteerd (${rows.length} regels)` });
  return csvResponse(toCsv([header, ...data]), `co2-logboek-${new Date().toISOString().slice(0, 10)}.csv`);
}
