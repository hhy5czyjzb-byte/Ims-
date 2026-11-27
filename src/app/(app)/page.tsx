import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getNormCoverage } from "@/lib/coverage";
import { formatDate } from "@/lib/format";
import { ACTION_STATUS_CLASS, ACTION_STATUS_LABEL } from "@/lib/labels";
import { Badge, PageHeader, ProgressBar, StatCard } from "@/components/ui";
import { RiskMatrix } from "@/components/risk-matrix";
import { residual } from "@/lib/risk";

export const metadata = { title: "Dashboard" };

const OPEN = { status: { in: ["OPEN" as const, "IN_PROGRESS" as const] } };

export default async function DashboardPage() {
  const user = await requireUser();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in30 = new Date(Date.now() + 30 * 86_400_000);

  const [openCount, overdueCount, myCount, docsRevision, docsUnlinked, docsTotal, coverage, overdueList, byDiscipline, disciplines, activeRisks] =
    await Promise.all([
      prisma.action.count({ where: OPEN }),
      prisma.action.count({ where: { ...OPEN, deadline: { lt: today } } }),
      prisma.action.count({ where: { ...OPEN, ownerId: user.id } }),
      prisma.document.count({ where: { revisionDate: { lte: in30 }, removedInSource: false } }),
      prisma.document.count({ where: { requirements: { none: {} }, processes: { none: {} }, processSteps: { none: {} } } }),
      prisma.document.count(),
      getNormCoverage(),
      prisma.action.findMany({
        where: { ...OPEN, deadline: { lt: today } },
        orderBy: { deadline: "asc" },
        take: 8,
        include: { owner: { select: { name: true } } },
      }),
      prisma.action.groupBy({ by: ["disciplineId"], where: OPEN, _count: true }),
      prisma.discipline.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      prisma.risk.findMany({
        where: { type: "RISK", status: { not: "CLOSED" } },
        select: { likelihoodBefore: true, impactBefore: true, likelihoodAfter: true, impactAfter: true, reviewDate: true },
      }),
    ]);

  // Restrisico's (open + beheerst): positie na maatregelen, of bruto als nog niet beoordeeld.
  const riskCounts: Record<string, number> = {};
  let highResidual = 0;
  let reviewOverdue = 0;
  for (const r of activeRisks) {
    const res = residual(r);
    const key = `${res.likelihood}-${res.impact}`;
    riskCounts[key] = (riskCounts[key] ?? 0) + 1;
    if (res.score >= 10) highResidual++;
    if (r.reviewDate && r.reviewDate < today) reviewOverdue++;
  }

  const activeNorms = coverage.filter((n) => n.active);
  const disciplineRows = [
    ...disciplines.map((d) => ({ name: d.name, count: byDiscipline.find((b) => b.disciplineId === d.id)?._count ?? 0, id: d.id })),
    { name: "Bedrijfsbreed", count: byDiscipline.find((b) => b.disciplineId === null)?._count ?? 0, id: "" },
  ];
  const maxDisc = Math.max(1, ...disciplineRows.map((r) => r.count));

  return (
    <>
      <PageHeader title={`Goedendag, ${user.name.split(" ")[0]}`} description="Stand van zaken van het integraal managementsysteem." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Lopende acties" value={openCount} href="/acties" />
        <StatCard label="Deadline verstreken" value={overdueCount} tone={overdueCount ? "alert" : "ok"} href="/acties?status=verlopen" />
        <StatCard label="Mijn acties" value={myCount} href="/acties?eigenaar=mij" />
        <StatCard
          label="Revisie ≤ 30 dagen"
          value={docsRevision}
          hint={`van ${docsTotal} documenten`}
          tone={docsRevision ? "alert" : "ok"}
          href="/documenten?filter=revisie"
        />
        <StatCard label="Documenten zonder koppeling" value={docsUnlinked} tone={docsUnlinked ? "alert" : "ok"} href="/documenten?filter=ongekoppeld" />
        <StatCard
          label="Hoge restrisico's"
          value={highResidual}
          hint={reviewOverdue ? `${reviewOverdue} beoordeling(en) verlopen` : "score 10 of hoger"}
          tone={highResidual ? "alert" : "ok"}
          href="/risicos?soort=RISK&basis=rest"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="mb-3 flex items-baseline justify-between">
            <h2>Status per norm</h2>
            <Link href="/normen" className="text-sm">
              Normenbeheer →
            </Link>
          </div>
          <p className="mb-3 text-xs text-neutral-500">Percentage normeisen waaraan bewijs (document, proces, processtap of risico) is gekoppeld.</p>
          <table className="table">
            <tbody>
              {activeNorms.map((n) => (
                <tr key={n.id}>
                  <td className="w-40">
                    <Link href={`/normen/${n.id}`} className="font-medium">
                      {n.code}
                    </Link>
                  </td>
                  <td>{n.leafCount ? <ProgressBar value={n.coveragePct} /> : <span className="text-xs text-neutral-400">Nog geen eisen ingevoerd</span>}</td>
                  <td className="w-24 text-right text-xs text-neutral-500 tabular-nums">
                    {n.covered}/{n.leafCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2 className="mb-3">Lopende acties per discipline</h2>
          <ul className="space-y-2 text-sm">
            {disciplineRows.map((r) => (
              <li key={r.name}>
                <Link href={r.id ? `/acties?discipline=${r.id}` : "/acties"} className="flex items-center gap-2 text-inherit no-underline hover:no-underline">
                  <span className="w-28 shrink-0 truncate">{r.name}</span>
                  <span className="h-3 flex-1 overflow-hidden rounded bg-neutral-100">
                    <span className="block h-full rounded bg-brand-red" style={{ width: `${(r.count / maxDisc) * 100}%` }} />
                  </span>
                  <span className="w-6 text-right tabular-nums">{r.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="mb-3">Acties met verstreken deadline</h2>
          {overdueList.length === 0 ? (
            <p className="text-sm text-green-700">Geen acties over de deadline. 👍</p>
          ) : (
            <table className="table">
              <tbody>
                {overdueList.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/acties/${a.id}`}>
                        #{a.number} {a.title}
                      </Link>
                    </td>
                    <td className="text-neutral-600">{a.owner?.name ?? "—"}</td>
                    <td className="font-semibold whitespace-nowrap text-brand-red">{formatDate(a.deadline)}</td>
                    <td>
                      <Badge className={ACTION_STATUS_CLASS[a.status]}>{ACTION_STATUS_LABEL[a.status]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card">
          <div className="mb-3 flex items-baseline justify-between">
            <h2>Restrisico&apos;s</h2>
            <Link href="/risicos" className="text-sm">
              Register →
            </Link>
          </div>
          <RiskMatrix type="RISK" counts={riskCounts} size="sm" href={(c) => `/risicos?soort=RISK&basis=rest&cel=${c.likelihood}-${c.impact}`} />
          <p className="mt-2 text-xs text-neutral-500">Open en beheerste risico&apos;s, na maatregelen. Klik op een cel voor de lijst.</p>
          <p className="mt-3 border-t border-dashed border-neutral-200 pt-2 text-xs text-neutral-400">
            Binnenkort: auditresultaten, CO2, compliance, milieuaspecten, certificaten en keuringen.
          </p>
        </section>
      </div>
    </>
  );
}
