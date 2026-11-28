import Link from "next/link";
import type { ReportType } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { getLookups } from "@/lib/lookups";
import { formatDate } from "@/lib/format";
import { reportDisplayCode, SAFETY_TYPES } from "@/lib/reports";
import { reportWhere, type ReportSearch } from "@/lib/report-filters";
import { findingCode } from "@/lib/audit-plan";
import {
  FINDING_CLASS_CLASS,
  FINDING_CLASS_LABEL,
  REPORT_ORIGIN_LABEL,
  REPORT_SEVERITY_CLASS,
  REPORT_SEVERITY_LABEL,
  REPORT_STATUS_CLASS,
  REPORT_STATUS_LABEL,
  REPORT_TYPE_CLASS,
  REPORT_TYPE_LABEL,
  options,
} from "@/lib/labels";
import { Badge, Disclosure, EmptyState, Field, PageHeader, Select } from "@/components/ui";
import { BarList, ChartCard, Columns, lastMonths, monthKey } from "@/components/charts";
import { ReportForm } from "@/components/report-form";
import { createReport } from "./actions";

export const metadata = { title: "Meldingen" };

const GROUPS: { name: string; types: ReportType[] }[] = [
  { name: "Veiligheid", types: ["ACCIDENT", "NEAR_MISS", "UNSAFE_SITUATION"] },
  { name: "Afwijking / klacht", types: ["NONCONFORMITY", "COMPLAINT"] },
  { name: "Milieu, schade en overig", types: ["ENVIRONMENTAL_INCIDENT", "DAMAGE", "IMPROVEMENT", "OTHER"] },
];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<ReportSearch> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const canManage = can(user.role, "reports.manage");
  const yearAgo = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 11, 1));
  const showFindings = !sp.soort || sp.soort === "AUDIT";

  const [reports, recent, findings, lookups] = await Promise.all([
    prisma.report.findMany({
      where: reportWhere(sp),
      orderBy: [{ occurredAt: "desc" }, { number: "desc" }],
      include: {
        location: { select: { name: true } },
        discipline: { select: { name: true } },
        owner: { select: { name: true } },
        _count: { select: { actions: true } },
        actions: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, select: { id: true } },
      },
      take: 2000,
    }),
    prisma.report.findMany({
      where: { occurredAt: { gte: yearAgo } },
      select: {
        type: true,
        occurredAt: true,
        injury: true,
        reportable: true,
        status: true,
        discipline: { select: { name: true } },
        location: { select: { name: true } },
        locationText: true,
      },
    }),
    showFindings
      ? prisma.auditFinding.findMany({
          where: sp.status === "CLOSED" ? { status: "CLOSED" } : sp.status === "alle" ? {} : { status: "OPEN" },
          orderBy: { createdAt: "desc" },
          include: { audit: { select: { id: true, number: true, title: true, plannedDate: true } }, _count: { select: { actions: true } } },
          take: 500,
        })
      : Promise.resolve([]),
    getLookups(),
  ]);

  const months = lastMonths(12);
  const byMonth = GROUPS.map((g) => ({
    name: g.name,
    values: months.map((m) => recent.filter((r) => g.types.includes(r.type) && monthKey(r.occurredAt) === m.key).length),
  }));
  const byType = (Object.keys(REPORT_TYPE_LABEL) as ReportType[])
    .map((t) => ({ label: REPORT_TYPE_LABEL[t], value: recent.filter((r) => r.type === t).length, href: `/meldingen?soort=${t}&status=alle` }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
  const placeOf = (r: (typeof recent)[number]) => r.discipline?.name ?? r.location?.name ?? r.locationText ?? "Onbekend";
  const byPlace = [...new Set(recent.map(placeOf))]
    .map((p) => ({ label: p, value: recent.filter((r) => placeOf(r) === p).length }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  const openCount = recent.filter((r) => r.status === "NEW" || r.status === "IN_PROGRESS").length;
  const accidents = recent.filter((r) => r.type === "ACCIDENT");
  const lti = accidents.filter((r) => r.injury === "LOST_TIME" || r.injury === "PERMANENT" || r.injury === "FATAL").length;
  const nearMiss = recent.filter((r) => r.type === "NEAR_MISS" || r.type === "UNSAFE_SITUATION").length;
  const exportQuery = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();

  const Tile = ({ href, n, label, tone }: { href: string; n: number; label: string; tone?: string }) => (
    <Link href={href} className="rounded-md border border-neutral-200 px-3 py-2 text-inherit no-underline hover:border-brand-red hover:no-underline">
      <div className={`text-2xl font-bold tabular-nums ${tone ?? ""}`}>{n}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Meldingen"
        description="Afwijkingen (NC's), klachten, ongevallen, bijna-ongevallen, onveilige situaties, milieu-incidenten en verbetervoorstellen — met directe maatregel, oorzaakanalyse, acties en controle op effectiviteit (ISO 9001/14001 §10.2, VCA, SCL). Auditbevindingen staan er ook bij."
        actions={
          <>
            {canManage && (
              <Link href="/meldingen/import" className="btn-secondary">
                Importeren uit Excel
              </Link>
            )}
            <a href={`/meldingen/export${exportQuery ? `?${exportQuery}` : ""}`} className="btn-secondary">
              Exporteren (CSV)
            </a>
          </>
        }
      />

      {can(user.role, "reports.create") && (
        <div className="mb-6">
          <Disclosure summary="Melding doen">
            <ReportForm formAction={createReport} lookups={lookups} submitLabel="Melding opslaan" />
          </Disclosure>
        </div>
      )}

      <section className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Tile href="/meldingen?status=lopend" n={openCount} label="open meldingen (12 mnd)" />
        <Tile href="/meldingen?soort=ACCIDENT&status=alle" n={accidents.length} label="ongevallen (12 mnd)" tone={accidents.length ? "text-brand-red" : ""} />
        <Tile href="/meldingen?soort=ACCIDENT&status=alle" n={lti} label="met verzuim of erger" tone={lti ? "text-brand-red" : ""} />
        <Tile href="/meldingen?soort=NEAR_MISS&status=alle" n={nearMiss} label="bijna-ongevallen en onveilig" />
        <Tile
          href="/meldingen?soort=NONCONFORMITY&status=lopend"
          n={recent.filter((r) => r.type === "NONCONFORMITY" && r.status !== "CLOSED" && r.status !== "REJECTED").length}
          label="open afwijkingen"
        />
        <Tile href="/meldingen?soort=AUDIT" n={findings.filter((f) => f.status === "OPEN").length} label="open auditbevindingen" />
      </section>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <ChartCard title="Meldingen per maand" subtitle="Laatste 12 maanden, naar groep" className="lg:col-span-2">
          <Columns periods={months.map((m) => ({ label: m.label, title: m.title }))} series={byMonth} />
        </ChartCard>
        <ChartCard title="Per soort" subtitle="Laatste 12 maanden">
          <BarList items={byType} empty="Nog geen meldingen." />
        </ChartCard>
      </div>
      {byPlace.length > 1 && (
        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <ChartCard title="Per bedrijfsonderdeel / locatie" subtitle="Laatste 12 maanden">
            <BarList items={byPlace} />
          </ChartCard>
        </div>
      )}

      <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <Field label="Zoeken">
          <input name="q" defaultValue={sp.q} className="input w-48" placeholder="Omschrijving, nr., project…" />
        </Field>
        <Field label="Soort">
          <Select
            name="soort"
            options={[
              { value: "veiligheid", label: "Veiligheid (ongeval, bijna, onveilig)" },
              ...options(REPORT_TYPE_LABEL),
              { value: "AUDIT", label: "Alleen auditbevindingen" },
            ]}
            defaultValue={sp.soort}
            placeholder="Alle"
          />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={sp.status ?? "lopend"} className="input">
            <option value="lopend">Open (nieuw + in behandeling)</option>
            {options(REPORT_STATUS_LABEL).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            <option value="alle">Alle</option>
          </select>
        </Field>
        <Field label="Herkomst">
          <Select name="herkomst" options={options(REPORT_ORIGIN_LABEL)} defaultValue={sp.herkomst} placeholder="Alle" />
        </Field>
        <Field label="Bedrijfsonderdeel">
          <Select name="discipline" options={lookups.disciplines} defaultValue={sp.discipline} placeholder="Alle" />
        </Field>
        <Field label="Vestiging">
          <Select name="locatie" options={lookups.locations} defaultValue={sp.locatie} placeholder="Alle" />
        </Field>
        <Field label="Jaar">
          <input name="jaar" defaultValue={sp.jaar} inputMode="numeric" className="input w-24" placeholder="Alle" />
        </Field>
        <button className="btn-secondary">Filteren</button>
        <Link href="/meldingen" className="btn-link self-center">
          Wissen
        </Link>
      </form>

      {reports.length === 0 && findings.length === 0 ? (
        <EmptyState>Geen meldingen met deze filters.</EmptyState>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Datum</th>
                <th>Soort</th>
                <th>Omschrijving</th>
                <th>Waar</th>
                <th>Ernst</th>
                <th>Behandelaar</th>
                <th className="text-center">Acties open</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td className="font-mono text-xs whitespace-nowrap">
                    <Link href={`/meldingen/${r.id}`}>{reportDisplayCode(r)}</Link>
                  </td>
                  <td className="whitespace-nowrap">{formatDate(r.occurredAt)}</td>
                  <td>
                    <Badge className={REPORT_TYPE_CLASS[r.type]}>{REPORT_TYPE_LABEL[r.type]}</Badge>
                    {r.origin !== "INTERNAL" && <div className="text-xs text-neutral-500">{REPORT_ORIGIN_LABEL[r.origin]}</div>}
                  </td>
                  <td>
                    <Link href={`/meldingen/${r.id}`} className="font-medium">
                      {r.title}
                    </Link>
                    {SAFETY_TYPES.includes(r.type) && r.reportable && <span className="ml-1 text-xs font-semibold text-brand-red">meldplichtig</span>}
                  </td>
                  <td className="text-xs">
                    {r.discipline?.name && <div>{r.discipline.name}</div>}
                    <div className="text-neutral-500">{r.location?.name ?? r.locationText ?? "—"}</div>
                  </td>
                  <td>{r.severity && <Badge className={REPORT_SEVERITY_CLASS[r.severity]}>{REPORT_SEVERITY_LABEL[r.severity]}</Badge>}</td>
                  <td className="text-xs">{r.owner?.name ?? r.ownerText ?? <span className="text-neutral-400">—</span>}</td>
                  <td className="text-center tabular-nums">
                    {r.actions.length}
                    <span className="text-neutral-400">/{r._count.actions}</span>
                  </td>
                  <td>
                    <Badge className={REPORT_STATUS_CLASS[r.status]}>{REPORT_STATUS_LABEL[r.status]}</Badge>
                  </td>
                </tr>
              ))}
              {findings.map((f) => (
                <tr key={f.id} className="bg-neutral-50/60">
                  <td className="font-mono text-xs whitespace-nowrap">
                    <Link href={`/audits/${f.auditId}/bevindingen/${f.id}`}>{findingCode(f.audit.number, f.number)}</Link>
                  </td>
                  <td className="whitespace-nowrap">{formatDate(f.audit.plannedDate)}</td>
                  <td>
                    <Badge className={FINDING_CLASS_CLASS[f.classification]}>Audit: {FINDING_CLASS_LABEL[f.classification]}</Badge>
                  </td>
                  <td>
                    <Link href={`/audits/${f.auditId}/bevindingen/${f.id}`} className="font-medium">
                      {f.description.length > 140 ? `${f.description.slice(0, 140)}…` : f.description}
                    </Link>
                    <div className="text-xs text-neutral-500">{f.audit.title}</div>
                  </td>
                  <td className="text-xs text-neutral-500">—</td>
                  <td />
                  <td className="text-xs text-neutral-400">QHSE</td>
                  <td className="text-center tabular-nums text-neutral-500">{f._count.actions}</td>
                  <td>
                    <Badge className={f.status === "OPEN" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}>
                      {f.status === "OPEN" ? "Open" : "Afgehandeld"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-neutral-500">
        {reports.length} melding{reports.length === 1 ? "" : "en"}
        {showFindings && ` en ${findings.length} auditbevinding${findings.length === 1 ? "" : "en"} (grijze regels; behandel die bij de audit)`}.
      </p>
    </>
  );
}
