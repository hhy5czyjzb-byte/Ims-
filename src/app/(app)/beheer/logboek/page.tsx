import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { Badge, Field, PageHeader } from "@/components/ui";

export const metadata = { title: "Logboek" };

const ACTIONS = ["LOGIN", "VIEW", "CREATE", "UPDATE", "DELETE", "SYNC"];

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<{ actie?: string; type?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "auditlog.view")) {
    return (
      <div className="card max-w-xl">
        <h2>Geen toegang</h2>
        <p className="mt-2 text-sm text-neutral-600">Je hebt geen rechten om het logboek te bekijken. Het logboek is alleen zichtbaar voor QHSE.</p>
      </div>
    );
  }
  const { actie, type } = await searchParams;
  const where: Prisma.AuditLogWhereInput = {
    ...(actie && ACTIONS.includes(actie) ? { action: actie } : {}),
    ...(type ? { entityType: type } : {}),
  };
  const [rows, types] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 300, include: { user: { select: { name: true } } } }),
    prisma.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true }, orderBy: { entityType: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/beheer", label: "Stamgegevens" }]}
        title="Logboek"
        description="Audit trail: wie heeft wat wanneer bekeken of gewijzigd (laatste 300 regels)."
      />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <Field label="Handeling">
          <select name="actie" defaultValue={actie ?? ""} className="input">
            <option value="">Alle</option>
            {ACTIONS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </Field>
        <Field label="Onderdeel">
          <select name="type" defaultValue={type ?? ""} className="input">
            <option value="">Alle</option>
            {types.map((t) => (
              <option key={t.entityType}>{t.entityType}</option>
            ))}
          </select>
        </Field>
        <button className="btn-secondary">Filteren</button>
      </form>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Tijdstip</th>
              <th>Gebruiker</th>
              <th>Handeling</th>
              <th>Onderdeel</th>
              <th>Omschrijving</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-neutral-600">{formatDateTime(r.createdAt)}</td>
                <td>{r.user?.name ?? r.userEmail ?? "—"}</td>
                <td>
                  <Badge
                    className={
                      r.action === "DELETE"
                        ? "bg-red-100 text-brand-red-dark"
                        : r.action === "VIEW"
                          ? "bg-neutral-100 text-neutral-600"
                          : "bg-blue-50 text-blue-800"
                    }
                  >
                    {r.action}
                  </Badge>
                </td>
                <td className="text-xs">
                  {r.entityType}
                  {r.entityId && <span className="block font-mono text-neutral-400">{r.entityId}</span>}
                </td>
                <td>{r.summary ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
