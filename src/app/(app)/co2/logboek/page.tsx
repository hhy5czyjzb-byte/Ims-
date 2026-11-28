import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { formatDateTime } from "@/lib/format";
import { readChanges } from "@/lib/audit-diff";
import { AUDIT_ACTION_LABEL, CO2_ENTITY_LABEL, co2AuditWhere, type Co2AuditSearch } from "@/lib/co2-audit";
import { Badge, Field, PageHeader } from "@/components/ui";
import { Co2Nav } from "@/components/co2-nav";

export const metadata = { title: "CO2-logboek" };

const ACTION_CLASS: Record<string, string> = {
  CREATE: "bg-green-100 text-green-800",
  UPDATE: "bg-sky-100 text-sky-800",
  DELETE: "bg-red-100 text-brand-red-dark",
  VIEW: "bg-neutral-100 text-neutral-600",
};

export default async function Co2LogPage({ searchParams }: { searchParams: Promise<Co2AuditSearch> }) {
  const user = await requireUser();
  if (!can(user.role, "auditlog.view") && !can(user.role, "co2.manage")) {
    return (
      <div className="card max-w-xl">
        <h2>Geen toegang</h2>
        <p className="mt-2 text-sm text-neutral-600">Het CO2-logboek is alleen zichtbaar voor QHSE.</p>
      </div>
    );
  }
  const sp = await searchParams;
  const where = await co2AuditWhere(sp);
  const [rows, count] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 500, include: { user: { select: { name: true } } } }),
    prisma.auditLog.count({ where }),
  ]);
  const exportQuery = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader
        title="CO2-prestatieladder"
        description="Audit trail van de CO2-prestatieladder: wie heeft wanneer welke emissiefactor, welk verbruik, welke maatregel of instelling toegevoegd, gewijzigd of verwijderd — met de oude en nieuwe waarde. Bewijs voor de borging van de emissie-inventaris (ISO 14064-1)."
        actions={
          <a href={`/co2/logboek/export${exportQuery ? `?${exportQuery}` : ""}`} className="btn-secondary">
            Exporteren (CSV)
          </a>
        }
      />
      <Co2Nav />
      <form className="mb-4 flex flex-wrap items-end gap-2 print:hidden" role="search">
        <Field label="Onderdeel">
          <select name="onderdeel" defaultValue={sp.onderdeel ?? ""} className="input">
            <option value="">Alle</option>
            {Object.entries(CO2_ENTITY_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Handeling">
          <select name="actie" defaultValue={sp.actie ?? ""} className="input">
            <option value="">Alle wijzigingen</option>
            {["CREATE", "UPDATE", "DELETE", "VIEW"].map((a) => (
              <option key={a} value={a}>
                {AUDIT_ACTION_LABEL[a]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Van">
          <input type="date" name="van" defaultValue={sp.van} className="input" />
        </Field>
        <Field label="Tot en met">
          <input type="date" name="tot" defaultValue={sp.tot} className="input" />
        </Field>
        <Field label="Zoeken">
          <input name="q" defaultValue={sp.q} className="input w-48" placeholder="Omschrijving of gebruiker" />
        </Field>
        <label className="flex items-center gap-1.5 pb-2 text-sm">
          <input type="checkbox" name="bekeken" value="ja" defaultChecked={sp.bekeken === "ja"} /> Ook bekeken
        </label>
        <button className="btn-secondary">Filteren</button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Wanneer</th>
              <th>Wie</th>
              <th>Onderdeel</th>
              <th>Handeling</th>
              <th>Omschrijving en wijzigingen</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-sm text-neutral-500">
                  Geen regels met deze filters.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const changes = readChanges(r.details);
              return (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap text-xs">{formatDateTime(r.createdAt)}</td>
                  <td className="text-xs">{r.user?.name ?? r.userEmail ?? "Systeem"}</td>
                  <td className="text-xs">{CO2_ENTITY_LABEL[r.entityType] ?? r.entityType}</td>
                  <td>
                    <Badge className={ACTION_CLASS[r.action]}>{AUDIT_ACTION_LABEL[r.action] ?? r.action}</Badge>
                  </td>
                  <td className="text-sm">
                    {r.summary}
                    {changes.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-xs text-neutral-600">
                        {changes.map((c) => (
                          <li key={c.field}>
                            <span className="font-medium">{c.label}:</span> <span className="line-through decoration-neutral-400">{c.from}</span> →{" "}
                            <span className="text-neutral-900">{c.to}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        {count > rows.length ? `Laatste ${rows.length} van ${count} regels; gebruik de filters of de export voor alles.` : `${count} regel(s).`} Het logboek kan
        niet worden gewijzigd of verwijderd.
      </p>
    </>
  );
}
