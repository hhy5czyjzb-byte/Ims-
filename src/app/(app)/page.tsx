import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getNormCoverage } from "@/lib/coverage";
import { formatDate } from "@/lib/format";
import {
  ACTION_STATUS_CLASS,
  ACTION_STATUS_LABEL,
  ASPECT_PRIORITY_CLASS,
  ASPECT_PRIORITY_SHORT,
  AUDIT_STATUS_CLASS,
  AUDIT_STATUS_LABEL,
  AUDIT_TYPE_CLASS,
  AUDIT_TYPE_SHORT,
  COMPLIANCE_STATUS_CLASS,
  COMPLIANCE_STATUS_LABEL,
  FINDING_CLASS_SHORT,
} from "@/lib/labels";
import { Badge, PageHeader, ProgressBar, StatCard } from "@/components/ui";
import { ChartCard, Columns, lastMonths, monthKey, SegmentBar } from "@/components/charts";
import { RiskMatrix } from "@/components/risk-matrix";
import { residual } from "@/lib/risk";
import { auditCode } from "@/lib/audit-plan";
import { complianceSummary, legalDisplayCode } from "@/lib/compliance";
import { aspectDisplayCode } from "@/lib/aspects";
import { listBackups } from "@/lib/backup";
import { localMode } from "@/lib/env";
import { can } from "@/lib/rbac";
import { formatTonnes, formatPct } from "@/lib/co2";
import { loadFactors, loadFootprint, targetStatus } from "@/lib/co2-data";

export const metadata = { title: "Dashboard" };

const OPEN = { status: { in: ["OPEN" as const, "IN_PROGRESS" as const] } };

export default async function DashboardPage() {
  const user = await requireUser();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in30 = new Date(Date.now() + 30 * 86_400_000);

  const [
    openCount,
    overdueCount,
    myCount,
    docsRevision,
    docsUnlinked,
    docsTotal,
    coverage,
    overdueList,
    byDiscipline,
    disciplines,
    activeRisks,
    upcomingAudits,
    legalStatuses,
    legalDue,
    sigAspects,
    openFindings,
  ] = await Promise.all([
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
    prisma.audit.findMany({
      where: { status: { in: ["PLANNED", "IN_PROGRESS"] }, plannedDate: { lte: new Date(Date.now() + 90 * 86_400_000) } },
      orderBy: { plannedDate: "asc" },
      take: 6,
      select: {
        id: true,
        number: true,
        title: true,
        type: true,
        status: true,
        plannedDate: true,
        norms: { select: { code: true }, orderBy: { sortOrder: "asc" } },
      },
    }),
    prisma.legalRequirement.findMany({ where: { active: true }, select: { status: true } }),
    prisma.legalRequirement.findMany({
      where: { active: true, status: { not: "NOT_APPLICABLE" }, nextReviewDate: { lte: in30 } },
      orderBy: { nextReviewDate: "asc" },
      take: 8,
      select: { id: true, number: true, externalRef: true, title: true, article: true, status: true, nextReviewDate: true, owner: { select: { name: true } } },
    }),
    prisma.environmentalAspect.findMany({
      where: { active: true, significant: true, inOperation: true },
      orderBy: [{ priority: "asc" }, { externalRef: { sort: "asc", nulls: "last" } }, { number: "asc" }],
      select: {
        id: true,
        number: true,
        externalRef: true,
        activity: true,
        aspect: true,
        businessUnit: true,
        locationText: true,
        theme: true,
        priority: true,
        opportunity: true,
        controls: true,
        measure: true,
        _count: { select: { actions: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } } } } },
      },
    }),
    prisma.auditFinding.findMany({
      where: { status: "OPEN" },
      select: { classification: true, dueDate: true, audit: { select: { norms: { select: { code: true } } } } },
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

  // CO2: lopend jaar (t/m vandaag) en vorig jaar, plus status van de doelstellingen.
  const co2Factors = await loadFactors();
  // Meldingen voor de grafiek op het dashboard
  const months = lastMonths(12);
  const recentReports = await prisma.report.findMany({
    where: { occurredAt: { gte: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 11, 1)) } },
    select: { type: true, occurredAt: true, status: true, absence: true },
  });
  // Gescheiden overzichten: ongevallen en incidenten / klachten / afwijkingen (auditbevindingen staan bij de audits).
  const perMonth = (types: string[]) => months.map((m) => recentReports.filter((r) => types.includes(r.type) && monthKey(r.occurredAt) === m.key).length);
  const incidentSeries = [
    { name: "Ongevallen", values: perMonth(["ACCIDENT"]) },
    { name: "Bijna-ongevallen en onveilig", values: perMonth(["NEAR_MISS", "UNSAFE_SITUATION"]) },
    { name: "Milieu en schade", values: perMonth(["ENVIRONMENTAL_INCIDENT", "DAMAGE"]) },
  ];
  const complaintSeries = [{ name: "Klachten", values: perMonth(["COMPLAINT"]) }];
  const ncSeries = [{ name: "Afwijkingen", values: perMonth(["NONCONFORMITY"]) }];
  const absenceShort12 = recentReports.filter((r) => r.absence === "SHORT").length;
  const absenceLong12 = recentReports.filter((r) => r.absence === "LONG").length;
  const openReports = await prisma.report.count({ where: { status: { in: ["NEW", "IN_PROGRESS"] } } });
  const accidents12 = recentReports.filter((r) => r.type === "ACCIDENT").length;

  const [co2Now, co2Prev, co2Targets] = await Promise.all([
    loadFootprint(today.getFullYear(), "jaar", {}, co2Factors),
    loadFootprint(today.getFullYear() - 1, "jaar", {}, co2Factors),
    prisma.reductionTarget.findMany({ where: { active: true }, orderBy: { targetYear: "asc" }, take: 4 }),
  ]);
  const co2TargetRows = await Promise.all(co2Targets.map(async (t) => ({ t, s: await targetStatus(t, co2Factors) })));

  // Back-upwaarschuwing (lokale modus, alleen QHSE): geen geslaagde back-up in de laatste 2 dagen.
  let backupWarning: string | null = null;
  if (localMode && can(user.role, "backup.manage")) {
    const lastOk = listBackups().find((b) => b.verify?.ok);
    if (!lastOk) backupWarning = "Er is nog geen geteste back-up van de database.";
    else if (Date.now() - new Date(lastOk.createdAt).getTime() > 2 * 86_400_000)
      backupWarning = `De laatste geteste back-up is van ${formatDate(lastOk.createdAt)}.`;
  }

  // Context- en stakeholderanalyse: herbeoordeling verlopen of nog niet vastgesteld (QHSE en directie).
  let contextWarning: string | null = null;
  if (can(user.role, "context.approve")) {
    const ctx = await prisma.contextAnalysis.findFirst({ where: { status: "APPROVED" }, orderBy: { approvedAt: "desc" }, select: { nextReviewDate: true } });
    const anyCtx = ctx ?? (await prisma.contextAnalysis.findFirst({ select: { id: true } }));
    if (anyCtx && !ctx) contextWarning = "De context- en stakeholderanalyse is nog niet vastgesteld.";
    else if (ctx?.nextReviewDate && ctx.nextReviewDate.getTime() < Date.now())
      contextWarning = `De herbeoordeling van de context- en stakeholderanalyse is verlopen (${formatDate(ctx.nextReviewDate)}).`;
  }

  const legalSummary = complianceSummary(legalStatuses.map((l) => l.status));

  const activeNorms = coverage.filter((n) => n.active);
  const disciplineRows = [
    ...disciplines.map((d) => ({ name: d.name, count: byDiscipline.find((b) => b.disciplineId === d.id)?._count ?? 0, id: d.id })),
    { name: "Bedrijfsbreed", count: byDiscipline.find((b) => b.disciplineId === null)?._count ?? 0, id: "" },
  ];
  const maxDisc = Math.max(1, ...disciplineRows.map((r) => r.count));

  return (
    <>
      {backupWarning && (
        <div role="alert" className="mb-4 rounded-md border border-brand-red/30 bg-red-50 px-3 py-2 text-sm text-brand-red-dark">
          {backupWarning}{" "}
          <Link href="/beheer" className="font-medium">
            Naar back-ups →
          </Link>
        </div>
      )}
      {contextWarning && (
        <div role="alert" className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {contextWarning}{" "}
          <Link href="/context" className="font-medium">
            Naar de analyse →
          </Link>
        </div>
      )}
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
        <ChartCard
          title="Ongevallen en incidenten per maand"
          subtitle={`Laatste 12 maanden · verzuim 1–15 dagen: ${absenceShort12} · meer dan 15 dagen: ${absenceLong12}`}
          className="lg:col-span-2"
        >
          <Columns periods={months.map((m) => ({ label: m.label, title: m.title }))} series={incidentSeries} height={110} />
          <p className="mt-2 text-xs">
            <Link href="/meldingen?groep=incidenten">Naar ongevallen en incidenten →</Link>
          </p>
        </ChartCard>
        <ChartCard title="Lopende acties">
          <SegmentBar
            parts={[
              { label: "Te laat", value: overdueCount, color: "#ec4647", href: "/acties?status=verlopen" },
              { label: "Op schema", value: Math.max(openCount - overdueCount, 0), color: "#257de0", href: "/acties" },
            ]}
          />
          <p className="mt-3 text-xs text-neutral-500">
            {openReports} open melding{openReports === 1 ? "" : "en"}
            {accidents12 > 0 && `, ${accidents12} ongeval${accidents12 === 1 ? "" : "len"} in 12 maanden`}.
          </p>
        </ChartCard>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Klachten per maand" subtitle="Laatste 12 maanden">
          <Columns periods={months.map((m) => ({ label: m.label, title: m.title }))} series={complaintSeries} height={90} />
          <p className="mt-2 text-xs">
            <Link href="/meldingen?groep=klachten">Naar de klachten →</Link>
          </p>
        </ChartCard>
        <ChartCard title="Afwijkingen (NC) per maand" subtitle="Laatste 12 maanden">
          <Columns periods={months.map((m) => ({ label: m.label, title: m.title }))} series={ncSeries} height={90} />
          <p className="mt-2 text-xs">
            <Link href="/meldingen?groep=afwijkingen">Naar de afwijkingen →</Link>
          </p>
        </ChartCard>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="mb-3 flex items-baseline justify-between">
            <h2>Status per norm</h2>
            <Link href="/normen" className="text-sm">
              Normenbeheer →
            </Link>
          </div>
          <p className="mb-3 text-xs text-neutral-500">
            Percentage normeisen waaraan bewijs (document, proces, processtap, risico, wettelijke eis of milieuaspect) is gekoppeld.
          </p>
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
        </section>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="mb-3 flex items-baseline justify-between">
            <h2>Audits komende 90 dagen</h2>
            <Link href="/audits" className="text-sm">
              Planning →
            </Link>
          </div>
          {upcomingAudits.length === 0 ? (
            <p className="text-sm text-neutral-500">Geen audits gepland in de komende 90 dagen.</p>
          ) : (
            <table className="table">
              <tbody>
                {upcomingAudits.map((a) => (
                  <tr key={a.id}>
                    <td className={`whitespace-nowrap ${a.plannedDate < today ? "font-semibold text-brand-red" : ""}`}>{formatDate(a.plannedDate)}</td>
                    <td>
                      <Badge className={`mr-1.5 ${AUDIT_TYPE_CLASS[a.type]}`}>{AUDIT_TYPE_SHORT[a.type]}</Badge>
                      <Link href={`/audits/${a.id}`}>
                        {auditCode(a.number)} {a.title}
                      </Link>
                    </td>
                    <td className="text-xs text-neutral-500">{a.norms.map((n) => n.code).join(", ")}</td>
                    <td>
                      <Badge className={AUDIT_STATUS_CLASS[a.status]}>{AUDIT_STATUS_LABEL[a.status]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card">
          <h2 className="mb-3">Open auditbevindingen</h2>
          {openFindings.length === 0 ? (
            <p className="text-sm text-green-700">Geen open bevindingen.</p>
          ) : (
            <>
              <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                {(["MAJOR", "MINOR", "OBSERVATION"] as const).map((c) => {
                  const n = openFindings.filter((f) => f.classification === c).length;
                  return (
                    <div key={c} className="rounded-md bg-neutral-50 p-2">
                      <div className={`text-2xl font-bold ${c !== "OBSERVATION" && n ? "text-brand-red" : ""}`}>{n}</div>
                      <div className="text-xs text-neutral-500">{FINDING_CLASS_SHORT[c]}</div>
                    </div>
                  );
                })}
              </div>
              <ul className="space-y-1 text-sm">
                {[...new Set(openFindings.flatMap((f) => f.audit.norms.map((n) => n.code)))].sort().map((code) => (
                  <li key={code} className="flex justify-between">
                    <span>{code}</span>
                    <span className="tabular-nums text-neutral-600">{openFindings.filter((f) => f.audit.norms.some((n) => n.code === code)).length}</span>
                  </li>
                ))}
              </ul>
              {openFindings.some((f) => f.dueDate && f.dueDate < today) && (
                <p className="mt-2 text-xs font-semibold text-brand-red">{openFindings.filter((f) => f.dueDate && f.dueDate < today).length} over de termijn</p>
              )}
            </>
          )}
          <p className="mt-3 border-t border-dashed border-neutral-200 pt-2 text-xs text-neutral-400">
            Binnenkort: certificaten, keuringen en directiebeoordeling.
          </p>
        </section>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="mb-3 flex items-baseline justify-between">
            <h2>Toetsingen wet- en regelgeving (verlopen en ≤ 30 dagen)</h2>
            <Link href="/wetgeving?toetsing=verlopen" className="text-sm">
              Register →
            </Link>
          </div>
          {legalDue.length === 0 ? (
            <p className="text-sm text-green-700">Geen toetsingen die verlopen zijn of binnenkort vervallen.</p>
          ) : (
            <table className="table">
              <tbody>
                {legalDue.map((l) => (
                  <tr key={l.id}>
                    <td className={`whitespace-nowrap ${l.nextReviewDate && l.nextReviewDate < today ? "font-semibold text-brand-red" : ""}`}>
                      {formatDate(l.nextReviewDate)}
                    </td>
                    <td>
                      <Link href={`/wetgeving/${l.id}`}>
                        {legalDisplayCode(l)} {l.title}
                        {l.article ? ` — ${l.article}` : ""}
                      </Link>
                    </td>
                    <td className="text-neutral-600">{l.owner?.name ?? "—"}</td>
                    <td>
                      <Badge className={COMPLIANCE_STATUS_CLASS[l.status]}>{COMPLIANCE_STATUS_LABEL[l.status]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card">
          <div className="mb-3 flex items-baseline justify-between">
            <h2>Compliance</h2>
            <Link href="/wetgeving" className="text-sm">
              Register →
            </Link>
          </div>
          {legalSummary.relevant === 0 ? (
            <p className="text-sm text-neutral-500">Nog geen wet- en regelgeving in het register.</p>
          ) : (
            <>
              <ProgressBar value={legalSummary.pct} />
              <p className="mt-1 text-xs text-neutral-500">voldoet, van {legalSummary.relevant} relevante eisen</p>
              <ul className="mt-3 space-y-1 text-sm">
                {(
                  [
                    ["COMPLIANT", legalSummary.compliant],
                    ["PARTIAL", legalSummary.partial],
                    ["NON_COMPLIANT", legalSummary.nonCompliant],
                    ["NOT_ASSESSED", legalSummary.notAssessed],
                  ] as const
                ).map(([st, n]) => (
                  <li key={st}>
                    <Link href={`/wetgeving?status=${st}`} className="flex items-center justify-between text-inherit no-underline hover:no-underline">
                      <Badge className={COMPLIANCE_STATUS_CLASS[st]}>{COMPLIANCE_STATUS_LABEL[st]}</Badge>
                      <span className="tabular-nums">{n}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="mb-3 flex items-baseline justify-between">
            <h2>Significante milieuaspecten</h2>
            <Link href="/milieuaspecten?significant=ja&werking=ja" className="text-sm">
              Register →
            </Link>
          </div>
          {sigAspects.length === 0 ? (
            <p className="text-sm text-neutral-500">Geen significante milieuaspecten (of het register is nog leeg).</p>
          ) : (
            <table className="table">
              <tbody>
                {sigAspects.slice(0, 8).map((a) => (
                  <tr key={a.id}>
                    <td className="w-10 text-center">
                      {a.priority && <Badge className={ASPECT_PRIORITY_CLASS[a.priority]}>{ASPECT_PRIORITY_SHORT[a.priority]}</Badge>}
                    </td>
                    <td>
                      <Link href={`/milieuaspecten/${a.id}`}>
                        {aspectDisplayCode(a)} {a.aspect}
                      </Link>
                      <div className="text-xs text-neutral-500">
                        {[a.businessUnit, a.locationText, a.activity].filter(Boolean).join(" · ")}
                        {a.opportunity && " · kans"}
                      </div>
                    </td>
                    <td className="text-xs whitespace-nowrap">
                      {a._count.actions > 0 ? (
                        <span>{a._count.actions} open actie(s)</span>
                      ) : a.measure ? (
                        <span className="text-neutral-500">Maatregel gepland</span>
                      ) : a.controls ? (
                        <span className="text-neutral-500">Voorzieningen</span>
                      ) : (
                        <span className="font-semibold text-brand-red">Geen maatregel / actie</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {sigAspects.length > 8 && <p className="mt-2 text-xs text-neutral-500">En nog {sigAspects.length - 8} significante aspecten.</p>}
        </section>
        <section className="card">
          <h2 className="mb-3">Significant per thema</h2>
          {sigAspects.length === 0 ? (
            <p className="text-sm text-neutral-500">—</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {[...new Set(sigAspects.map((a) => a.theme ?? "Overig"))].sort().map((t) => (
                <li key={t}>
                  <Link
                    href={`/milieuaspecten?significant=ja&werking=ja${t === "Overig" ? "" : `&thema=${encodeURIComponent(t)}`}`}
                    className="flex justify-between text-inherit no-underline hover:no-underline"
                  >
                    <span>{t}</span>
                    <span className="tabular-nums">{sigAspects.filter((a) => (a.theme ?? "Overig") === t).length}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="mb-3 flex items-baseline justify-between">
            <h2>CO2-footprint</h2>
            <Link href="/co2" className="text-sm">
              CO2-prestatieladder →
            </Link>
          </div>
          {co2Now.rows.length === 0 && co2Prev.rows.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Nog geen energieverbruik vastgelegd. <Link href="/co2/verbruik">Verbruik invoeren</Link>
            </p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th></th>
                  <th className="text-right">Scope 1</th>
                  <th className="text-right">Scope 2</th>
                  <th className="text-right">Scope 3</th>
                  <th className="text-right">Totaal</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: `${today.getFullYear() - 1}`, fp: co2Prev },
                  { label: `${today.getFullYear()} (t/m vandaag)`, fp: co2Now },
                ].map(({ label, fp }) => (
                  <tr key={label}>
                    <td className="whitespace-nowrap">{label}</td>
                    {([1, 2, 3] as const).map((sc) => (
                      <td key={sc} className="text-right tabular-nums">
                        {formatTonnes(fp.byScope[sc])}
                      </td>
                    ))}
                    <td className="text-right font-semibold tabular-nums">{formatTonnes(fp.totalKg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {co2Now.missingFactor + co2Prev.missingFactor > 0 && (
            <p className="mt-2 text-xs text-amber-700">
              {co2Now.missingFactor + co2Prev.missingFactor} verbruiksregel(s) zonder emissiefactor tellen niet mee.{" "}
              <Link href="/co2/factoren">Emissiefactoren</Link>
            </p>
          )}
        </section>
        <section className="card">
          <h2 className="mb-3">CO2-doelstellingen</h2>
          {co2TargetRows.length === 0 ? (
            <p className="text-sm text-neutral-500">Nog geen doelstellingen.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {co2TargetRows.map(({ t, s }) => (
                <li key={t.id}>
                  <Link href={`/co2/doelstellingen/${t.id}`}>{t.title}</Link>
                  {s.latestFull ? (
                    <>
                      <ProgressBar value={Number(t.reductionPct) > 0 ? (Math.max(0, s.latestFull.actualPct) / Number(t.reductionPct)) * 100 : 0} />
                      <div className={`text-xs ${s.latestFull.onTrack ? "text-green-700" : "text-brand-red"}`}>
                        {s.latestFull.year}: {formatPct(s.latestFull.actualPct)} van {Number(t.reductionPct)} % ·{" "}
                        {s.latestFull.onTrack ? "op koers" : "achter op schema"}
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-neutral-400">Nog geen volledig jaar na het basisjaar</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
