import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { flattenTree } from "@/lib/tree";
import { formatDate } from "@/lib/format";
import { auditCode, cycleCell, cycleSummary, CYCLE_YEARS, type ChecklistHit } from "@/lib/audit-plan";
import { AUDIT_STATUS_CLASS, AUDIT_STATUS_LABEL, AUDIT_TYPE_SHORT } from "@/lib/labels";
import { Badge, EmptyState, Field, PageHeader, ProgressBar } from "@/components/ui";

export const metadata = { title: "Auditplanning certificatiecyclus" };

export default async function CyclePage({ searchParams }: { searchParams: Promise<{ norm?: string; start?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const thisYear = new Date().getFullYear();
  const start = Number(sp.start) >= 2000 && Number(sp.start) <= 2100 ? Number(sp.start) : thisYear;
  const years = Array.from({ length: CYCLE_YEARS }, (_, i) => start + i);

  const norms = await prisma.norm.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    select: { id: true, code: true, _count: { select: { requirements: true } } },
  });
  const normId = sp.norm && norms.some((n) => n.id === sp.norm) ? sp.norm : norms.find((n) => n._count.requirements > 0)?.id;
  const norm = norms.find((n) => n.id === normId);

  const requirements = normId
    ? await prisma.normRequirement.findMany({
        where: { normId },
        select: {
          id: true,
          clause: true,
          title: true,
          parentId: true,
          sortOrder: true,
          _count: { select: { children: true } },
          checklistItems: {
            select: {
              result: true,
              audit: { select: { id: true, number: true, status: true, plannedDate: true, completedDate: true } },
            },
          },
        },
      })
    : [];
  const rows = flattenTree(requirements);
  const leaves = rows.filter((r) => r._count.children === 0);
  const summary = cycleSummary(
    leaves.map((r) => r.checklistItems as ChecklistHit[]),
    start,
  );

  const audits = normId
    ? await prisma.audit.findMany({
        where: {
          norms: { some: { id: normId } },
          plannedDate: { gte: new Date(Date.UTC(start, 0, 1)), lt: new Date(Date.UTC(start + CYCLE_YEARS, 0, 1)) },
        },
        orderBy: { plannedDate: "asc" },
        select: { id: true, number: true, title: true, type: true, status: true, plannedDate: true, completedDate: true },
      })
    : [];

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/audits", label: "Audits" }]}
        title="Auditplanning certificatiecyclus"
        description="Per normeis zie je over de cyclus van 3 jaar of de eis in een afgeronde audit is getoetst, alleen gepland is, of nog nergens is afgedekt. Zo plan je audits zó dat alle eisen binnen de cyclus aan bod komen."
      />

      <form className="mb-4 flex flex-wrap items-end gap-2">
        <Field label="Norm">
          <select name="norm" defaultValue={normId} className="input">
            {norms.map((n) => (
              <option key={n.id} value={n.id}>
                {n.code}
                {n._count.requirements === 0 ? " (geen eisen)" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Eerste jaar van de cyclus">
          <select name="start" defaultValue={String(start)} className="input">
            {Array.from({ length: 8 }, (_, i) => thisYear - 4 + i).map((y) => (
              <option key={y} value={y}>
                {y} – {y + CYCLE_YEARS - 1}
              </option>
            ))}
          </select>
        </Field>
        <button className="btn-secondary">Tonen</button>
      </form>

      {!norm || leaves.length === 0 ? (
        <EmptyState>Deze norm heeft nog geen eisen. Voer eerst eisen in via Normenbeheer.</EmptyState>
      ) : (
        <>
          <div className="mb-4 grid gap-4 lg:grid-cols-3">
            <section className="card lg:col-span-2">
              <h2 className="mb-2">
                {norm.code} · {start}–{start + CYCLE_YEARS - 1}
              </h2>
              <ProgressBar value={summary.pct} />
              <div className="mt-2 flex flex-wrap gap-4 text-sm">
                <span>
                  <Badge className="bg-green-100 text-green-800">{summary.assessed}</Badge> getoetst
                </span>
                <span>
                  <Badge className="bg-blue-100 text-blue-800">{summary.planned}</Badge> alleen gepland
                </span>
                <span>
                  <Badge className={summary.uncovered ? "bg-red-100 text-brand-red-dark" : "bg-neutral-100"}>{summary.uncovered}</Badge> niet afgedekt
                </span>
                <span className="text-neutral-500">van {summary.total} eisen</span>
              </div>
              {summary.uncovered > 0 && (
                <p className="mt-2 text-xs text-neutral-500">
                  Tip: plan een audit voor {norm.code} en zet de niet-afgedekte eisen op de checklist (Audit → Checklist samenstellen).
                </p>
              )}
            </section>
            <section className="card text-sm">
              <h2 className="mb-2">Audits in deze cyclus</h2>
              {audits.length === 0 ? (
                <p className="text-neutral-500">Nog geen audits gepland.</p>
              ) : (
                <ul className="space-y-1">
                  {audits.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-1.5">
                      <Link href={`/audits/${a.id}`} className="font-mono text-xs">
                        {auditCode(a.number)}
                      </Link>
                      <span className="text-neutral-500">{formatDate(a.completedDate ?? a.plannedDate)}</span>
                      <span>{AUDIT_TYPE_SHORT[a.type]}</span>
                      <Badge className={AUDIT_STATUS_CLASS[a.status]}>{AUDIT_STATUS_LABEL[a.status]}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="card overflow-x-auto p-0">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-24">Par.</th>
                  <th>Eis</th>
                  {years.map((y) => (
                    <th key={y} className="w-36 text-center">
                      {y}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isChapter = r._count.children > 0;
                  const hits = r.checklistItems as ChecklistHit[];
                  return (
                    <tr key={r.id} className={isChapter ? "bg-neutral-50" : ""}>
                      <td className="tabular-nums" style={{ paddingLeft: `${0.75 + r.depth}rem` }}>
                        {r.clause}
                      </td>
                      <td className={isChapter ? "font-semibold" : ""}>{r.title}</td>
                      {years.map((y) => {
                        if (isChapter) return <td key={y} />;
                        const cell = cycleCell(hits, y);
                        return (
                          <td key={y} className="text-center">
                            {cell.state === "none" ? (
                              <span className="text-neutral-300">—</span>
                            ) : (
                              <span className="flex flex-wrap justify-center gap-1">
                                {cell.audits.map((a) => (
                                  <Link key={a.id} href={`/audits/${a.id}`} className="no-underline">
                                    <Badge className={cell.state === "assessed" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}>
                                      {cell.state === "assessed" ? "✓ " : ""}
                                      {auditCode(a.number)}
                                    </Badge>
                                  </Link>
                                ))}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            ✓ groen = getoetst in een afgeronde audit · blauw = gepland of nog niet getoetst · — = niet afgedekt in dat jaar. De cyclus loopt per kalenderjaar;
            koppeling aan de certificaatdata volgt met het certificatenarchief.
          </p>
        </>
      )}
    </>
  );
}
