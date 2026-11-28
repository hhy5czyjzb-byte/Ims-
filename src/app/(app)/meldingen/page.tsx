import Link from "next/link";
import type { ReportType } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { getLookups } from "@/lib/lookups";
import { formatDate } from "@/lib/format";
import { ACCIDENT_CATEGORIES, REPORT_GROUPS, reportDisplayCode, reportGroup, SAFETY_TYPES } from "@/lib/reports";
import { reportWhere, type ReportSearch } from "@/lib/report-filters";
import { findingCode } from "@/lib/audit-plan";
import {
  ABSENCE_CLASS,
  ABSENCE_LABEL,
  AUDIT_TYPE_SHORT,
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
import { BarList, ChartCard, Columns, SegmentBar, lastMonths, monthKey } from "@/components/charts";
import { ReportForm } from "@/components/report-form";
import { createReport } from "./actions";

export const metadata = { title: "Meldingen" };

const STATUS_COLORS = { open: "#f2c12e", busy: "#257de0", done: "#3fa34d", none: "#a3a3a3", bad: "#e30613" };
const eur = (v: number) => v.toLocaleString("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

function Tile({ href, n, label, tone }: { href: string; n: number | string; label: string; tone?: string }) {
  return (
    <Link href={href} className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-inherit no-underline hover:border-brand-red hover:no-underline">
      <div className={`text-2xl font-bold tabular-nums ${tone ?? ""}`}>{n}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </Link>
  );
}

function countBy<T>(rows: T[], key: (r: T) => string | null | undefined, empty: string, href?: (k: string) => string, limit = 8) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r)?.trim() || empty;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([label, value]) => ({ label, value, href: href && label !== empty ? href(label) : undefined }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<ReportSearch> }) {
  const user = await requireUser();
  const raw = await searchParams;
  const group = reportGroup(raw.groep);
  const sp: ReportSearch = { ...raw, groep: group.key };
  const canManage = can(user.role, "reports.manage");
  const now = new Date();
  const yearAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const months = lastMonths(12);
  const periods = months.map((m) => ({ label: m.label, title: m.title }));
  const base = (extra: Record<string, string>) => `/meldingen?${new URLSearchParams({ groep: group.key, ...extra }).toString()}`;

  const [openPerType, lookups] = await Promise.all([
    prisma.report.groupBy({ by: ["type"], where: { status: { in: ["NEW", "IN_PROGRESS"] } }, _count: true }),
    getLookups(),
  ]);
  const openFindings = await prisma.auditFinding.count({ where: { status: "OPEN" } });
  const openIn = (types: ReportType[]) => openPerType.filter((g) => types.includes(g.type)).reduce((n, g) => n + g._count, 0);

  const header = (
    <>
      <PageHeader
        title="Meldingen"
        description={group.description}
        actions={
          group.key !== "audit" ? (
            <>
              {canManage && (
                <Link href="/meldingen/import" className="btn-secondary">
                  Importeren uit Excel
                </Link>
              )}
              <a
                href={`/meldingen/export?${new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString()}`}
                className="btn-secondary"
              >
                Exporteren (CSV)
              </a>
            </>
          ) : undefined
        }
      />
      {can(user.role, "reports.create") && (
        <div className="mb-4">
          <Disclosure summary="Melding doen">
            <ReportForm formAction={createReport} lookups={lookups} submitLabel="Melding opslaan" />
          </Disclosure>
        </div>
      )}
      <nav className="mb-6 flex flex-wrap gap-1 border-b border-neutral-200 print:hidden" aria-label="Soort meldingen">
        {REPORT_GROUPS.map((g) => {
          const n = g.key === "audit" ? openFindings : openIn(g.types);
          return (
            <Link
              key={g.key}
              href={`/meldingen?groep=${g.key}`}
              className={`-mb-px border-b-2 px-3 py-2 text-sm no-underline ${g.key === group.key ? "border-brand-red font-semibold text-brand-red-dark" : "border-transparent text-neutral-600 hover:text-neutral-900"}`}
            >
              {g.label}
              {n > 0 && <span className="ml-1.5 rounded-full bg-neutral-100 px-1.5 text-xs text-neutral-600 tabular-nums">{n}</span>}
            </Link>
          );
        })}
      </nav>
      <h2 className="mb-3 hidden print:block">{group.label}</h2>
    </>
  );

  // ── Auditbevindingen: apart overzicht, behandeling bij de audit ──
  if (group.key === "audit") {
    const status = raw.status ?? "lopend";
    const [findings, recentFindings] = await Promise.all([
      prisma.auditFinding.findMany({
        where: status === "CLOSED" ? { status: "CLOSED" } : status === "alle" ? {} : { status: "OPEN" },
        orderBy: { createdAt: "desc" },
        include: { audit: { select: { id: true, number: true, title: true, plannedDate: true, type: true } }, _count: { select: { actions: true } } },
        take: 1000,
      }),
      prisma.auditFinding.findMany({
        where: { audit: { plannedDate: { gte: yearAgo } } },
        select: { classification: true, status: true, audit: { select: { plannedDate: true, type: true } } },
      }),
    ]);
    const open = recentFindings.filter((f) => f.status === "OPEN");
    return (
      <>
        {header}
        <section className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile href={base({})} n={openFindings} label="open bevindingen (alle)" />
          <Tile href={base({})} n={open.filter((f) => f.classification === "MAJOR").length} label="major open (12 mnd)" tone="text-brand-red" />
          <Tile href={base({})} n={open.filter((f) => f.classification === "MINOR").length} label="minor open (12 mnd)" />
          <Tile href={base({ status: "CLOSED" })} n={recentFindings.filter((f) => f.status === "CLOSED").length} label="afgehandeld (12 mnd)" />
        </section>
        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <ChartCard title="Bevindingen per maand" subtitle="Laatste 12 maanden, naar classificatie (datum audit)" className="lg:col-span-2">
            <Columns
              periods={periods}
              series={(["MAJOR", "MINOR", "OBSERVATION"] as const).map((c) => ({
                name: FINDING_CLASS_LABEL[c],
                values: months.map((m) => recentFindings.filter((f) => f.classification === c && monthKey(f.audit.plannedDate) === m.key).length),
              }))}
            />
          </ChartCard>
          <ChartCard title="Status" subtitle="Laatste 12 maanden">
            <SegmentBar
              parts={[
                { label: "Open", value: open.length, color: STATUS_COLORS.open },
                { label: "Afgehandeld", value: recentFindings.length - open.length, color: STATUS_COLORS.done },
              ]}
            />
            <div className="mt-4">
              <BarList items={countBy(recentFindings, (f) => AUDIT_TYPE_SHORT[f.audit.type], "Onbekend")} />
            </div>
          </ChartCard>
        </div>
        <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
          <input type="hidden" name="groep" value="audit" />
          <Field label="Status">
            <select name="status" defaultValue={status} className="input">
              <option value="lopend">Open</option>
              <option value="CLOSED">Afgehandeld</option>
              <option value="alle">Alle</option>
            </select>
          </Field>
          <button className="btn-secondary">Filteren</button>
        </form>
        {findings.length === 0 ? (
          <EmptyState>Geen auditbevindingen met deze filters.</EmptyState>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="table">
              <thead>
                <tr>
                  <th>Nr.</th>
                  <th>Datum audit</th>
                  <th>Classificatie</th>
                  <th>Bevinding</th>
                  <th className="text-center">Acties</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {findings.map((f) => (
                  <tr key={f.id}>
                    <td className="font-mono text-xs whitespace-nowrap">
                      <Link href={`/audits/${f.auditId}/bevindingen/${f.id}`}>{findingCode(f.audit.number, f.number)}</Link>
                    </td>
                    <td className="whitespace-nowrap">{formatDate(f.audit.plannedDate)}</td>
                    <td>
                      <Badge className={FINDING_CLASS_CLASS[f.classification]}>{FINDING_CLASS_LABEL[f.classification]}</Badge>
                    </td>
                    <td>
                      <Link href={`/audits/${f.auditId}/bevindingen/${f.id}`} className="font-medium">
                        {f.description.length > 160 ? `${f.description.slice(0, 160)}…` : f.description}
                      </Link>
                      <div className="text-xs text-neutral-500">
                        {AUDIT_TYPE_SHORT[f.audit.type]} · {f.audit.title}
                      </div>
                    </td>
                    <td className="text-center tabular-nums">{f._count.actions}</td>
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
          {findings.length} bevinding{findings.length === 1 ? "" : "en"}. Bevindingen behandel je bij de audit (oorzaakanalyse en acties); ze tellen niet mee in
          de meldingen.
        </p>
      </>
    );
  }

  // ── Meldingen van deze groep ──
  const types = group.types;
  const [reports, recent] = await Promise.all([
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
      where: { occurredAt: { gte: yearAgo }, type: { in: types } },
      select: {
        type: true,
        occurredAt: true,
        injury: true,
        absence: true,
        lostDays: true,
        accidentCategory: true,
        reportable: true,
        status: true,
        origin: true,
        closedAt: true,
        costs: true,
        causeCategory: true,
        rootCause: true,
        discipline: { select: { name: true } },
        location: { select: { name: true } },
        locationText: true,
      },
    }),
  ]);
  const isOpen = (r: { status: string }) => r.status === "NEW" || r.status === "IN_PROGRESS";
  const placeOf = (r: (typeof recent)[number]) => r.discipline?.name ?? r.location?.name ?? r.locationText ?? null;
  const perMonth = (pred: (r: (typeof recent)[number]) => boolean) =>
    months.map((m) => recent.filter((r) => pred(r) && monthKey(r.occurredAt) === m.key).length);
  const statusParts = [
    { label: "Nieuw", value: recent.filter((r) => r.status === "NEW").length, color: STATUS_COLORS.open, href: base({ status: "NEW" }) },
    {
      label: "In behandeling",
      value: recent.filter((r) => r.status === "IN_PROGRESS").length,
      color: STATUS_COLORS.busy,
      href: base({ status: "IN_PROGRESS" }),
    },
    { label: "Afgesloten", value: recent.filter((r) => r.status === "CLOSED").length, color: STATUS_COLORS.done, href: base({ status: "CLOSED" }) },
    { label: "Afgewezen", value: recent.filter((r) => r.status === "REJECTED").length, color: STATUS_COLORS.none, href: base({ status: "REJECTED" }) },
  ];

  let tiles: React.ReactNode = null;
  let charts: React.ReactNode = null;

  if (group.key === "incidenten") {
    const accidents = recent.filter((r) => r.type === "ACCIDENT");
    const short = recent.filter((r) => r.absence === "SHORT");
    const long = recent.filter((r) => r.absence === "LONG");
    const days = recent.reduce((n, r) => n + (r.lostDays ?? 0), 0);
    const nearMiss = recent.filter((r) => r.type === "NEAR_MISS" || r.type === "UNSAFE_SITUATION").length;
    tiles = (
      <>
        <Tile
          href={base({ soort: "ACCIDENT", status: "alle" })}
          n={accidents.length}
          label="ongevallen (12 mnd)"
          tone={accidents.length ? "text-brand-red" : ""}
        />
        <Tile
          href={base({ verzuim: "kort", status: "alle" })}
          n={short.length}
          label="letsel / verzuim 1–15 dagen"
          tone={short.length ? "text-amber-700" : ""}
        />
        <Tile href={base({ verzuim: "lang", status: "alle" })} n={long.length} label="verzuim meer dan 15 dagen" tone={long.length ? "text-brand-red" : ""} />
        <Tile href={base({ verzuim: "ja", status: "alle" })} n={days} label="verzuimdagen (12 mnd)" />
        <Tile href={base({ soort: "NEAR_MISS", status: "alle" })} n={nearMiss} label="bijna-ongevallen en onveilig" />
        <Tile href={base({ status: "lopend" })} n={recent.filter(isOpen).length} label="open (12 mnd)" />
      </>
    );
    charts = (
      <>
        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <ChartCard title="Incidenten per maand" subtitle="Laatste 12 maanden" className="lg:col-span-2">
            <Columns
              periods={periods}
              series={[
                { name: "Ongevallen", values: perMonth((r) => r.type === "ACCIDENT") },
                { name: "Bijna-ongevallen en onveilig", values: perMonth((r) => r.type === "NEAR_MISS" || r.type === "UNSAFE_SITUATION") },
                { name: "Milieu en schade", values: perMonth((r) => r.type === "ENVIRONMENTAL_INCIDENT" || r.type === "DAMAGE") },
              ]}
            />
          </ChartCard>
          <ChartCard title="Ongevallen naar verzuim" subtitle={`${accidents.length} ongevallen, laatste 12 maanden`}>
            <SegmentBar
              parts={[
                {
                  label: "Meer dan 15 dagen",
                  value: accidents.filter((r) => r.absence === "LONG").length,
                  color: STATUS_COLORS.bad,
                  href: base({ soort: "ACCIDENT", verzuim: "lang", status: "alle" }),
                },
                {
                  label: "1–15 dagen",
                  value: accidents.filter((r) => r.absence === "SHORT").length,
                  color: STATUS_COLORS.open,
                  href: base({ soort: "ACCIDENT", verzuim: "kort", status: "alle" }),
                },
                { label: "Geen verzuim", value: accidents.filter((r) => !r.absence).length, color: STATUS_COLORS.none },
              ]}
            />
            <p className="mt-3 text-xs text-neutral-500">{accidents.filter((r) => r.reportable).length} meldplichtig</p>
          </ChartCard>
        </div>
        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <ChartCard title="Ongevallen per categorie" subtitle="Laatste 12 maanden">
            <BarList
              items={countBy(
                accidents,
                (r) => r.accidentCategory,
                "Niet ingevuld",
                (k) => base({ soort: "ACCIDENT", categorie: k, status: "alle" }),
              )}
              empty="Nog geen ongevallen."
            />
          </ChartCard>
          <ChartCard title="Per soort" subtitle="Laatste 12 maanden">
            <BarList items={countBy(recent, (r) => REPORT_TYPE_LABEL[r.type], "Overig")} empty="Nog geen meldingen." />
          </ChartCard>
          <ChartCard title="Per bedrijfsonderdeel / locatie" subtitle="Laatste 12 maanden">
            <BarList items={countBy(recent, placeOf, "Onbekend")} empty="Nog geen meldingen." />
          </ChartCard>
        </div>
      </>
    );
  } else if (group.key === "klachten") {
    const closed = recent.filter((r) => r.status === "CLOSED" && r.closedAt);
    const lead = closed.length
      ? Math.round(closed.reduce((n, r) => n + (r.closedAt!.getTime() - r.occurredAt.getTime()) / 86_400_000, 0) / closed.length)
      : null;
    tiles = (
      <>
        <Tile
          href={base({ status: "lopend" })}
          n={recent.filter(isOpen).length}
          label="open klachten"
          tone={recent.filter(isOpen).length ? "text-brand-red" : ""}
        />
        <Tile href={base({ status: "alle" })} n={recent.length} label="klachten (12 mnd)" />
        <Tile href={base({ status: "CLOSED" })} n={closed.length} label="afgesloten (12 mnd)" />
        <Tile href={base({ status: "CLOSED" })} n={lead === null ? "—" : `${lead} d`} label="gem. doorlooptijd" />
      </>
    );
    charts = (
      <>
        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <ChartCard title="Klachten per maand" subtitle="Laatste 12 maanden" className="lg:col-span-2">
            <Columns periods={periods} series={[{ name: "Klachten", values: perMonth(() => true) }]} />
          </ChartCard>
          <ChartCard title="Status" subtitle="Laatste 12 maanden">
            <SegmentBar parts={statusParts} />
          </ChartCard>
        </div>
        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <ChartCard title="Per herkomst" subtitle="Van wie komt de klacht?">
            <BarList items={countBy(recent, (r) => REPORT_ORIGIN_LABEL[r.origin], "Onbekend")} empty="Nog geen klachten." />
          </ChartCard>
          <ChartCard title="Per bedrijfsonderdeel / locatie">
            <BarList items={countBy(recent, placeOf, "Onbekend")} empty="Nog geen klachten." />
          </ChartCard>
          <ChartCard title="Per oorzaakcategorie">
            <BarList items={countBy(recent, (r) => r.causeCategory, "Nog niet geanalyseerd")} empty="Nog geen klachten." />
          </ChartCard>
        </div>
      </>
    );
  } else if (group.key === "afwijkingen") {
    const costs = recent.reduce((n, r) => n + Number(r.costs ?? 0), 0);
    const noCause = recent.filter((r) => isOpen(r) && !r.rootCause?.trim()).length;
    tiles = (
      <>
        <Tile href={base({ status: "lopend" })} n={recent.filter(isOpen).length} label="open afwijkingen" />
        <Tile href={base({ status: "alle" })} n={recent.length} label="afwijkingen (12 mnd)" />
        <Tile href={base({ status: "lopend" })} n={noCause} label="open zonder oorzaakanalyse" tone={noCause ? "text-amber-700" : ""} />
        <Tile href={base({ status: "alle" })} n={eur(costs)} label="faalkosten (12 mnd)" />
      </>
    );
    const costByPlace = [...new Set(recent.map((r) => placeOf(r) ?? "Onbekend"))]
      .map((p) => ({ label: p, value: Math.round(recent.filter((r) => (placeOf(r) ?? "Onbekend") === p).reduce((n, r) => n + Number(r.costs ?? 0), 0)) }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
    charts = (
      <>
        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <ChartCard title="Afwijkingen per maand" subtitle="Laatste 12 maanden" className="lg:col-span-2">
            <Columns periods={periods} series={[{ name: "Afwijkingen", values: perMonth(() => true) }]} />
          </ChartCard>
          <ChartCard title="Status" subtitle="Laatste 12 maanden">
            <SegmentBar parts={statusParts} />
          </ChartCard>
        </div>
        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <ChartCard title="Per oorzaakcategorie">
            <BarList items={countBy(recent, (r) => r.causeCategory, "Nog niet geanalyseerd")} empty="Nog geen afwijkingen." />
          </ChartCard>
          <ChartCard title="Per bedrijfsonderdeel / locatie">
            <BarList items={countBy(recent, placeOf, "Onbekend")} empty="Nog geen afwijkingen." />
          </ChartCard>
          <ChartCard title="Faalkosten per bedrijfsonderdeel / locatie" subtitle="In euro, laatste 12 maanden">
            <BarList items={costByPlace} unit=" euro" empty="Nog geen faalkosten vastgelegd." />
          </ChartCard>
        </div>
      </>
    );
  } else {
    tiles = (
      <>
        <Tile href={base({ status: "lopend" })} n={recent.filter(isOpen).length} label="open" />
        <Tile href={base({ status: "alle" })} n={recent.length} label="ingediend (12 mnd)" />
        <Tile href={base({ status: "CLOSED" })} n={recent.filter((r) => r.status === "CLOSED").length} label="afgerond (12 mnd)" />
      </>
    );
    charts = (
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <ChartCard title="Per maand" subtitle="Laatste 12 maanden" className="lg:col-span-2">
          <Columns periods={periods} series={types.map((t) => ({ name: REPORT_TYPE_LABEL[t], values: perMonth((r) => r.type === t) }))} />
        </ChartCard>
        <ChartCard title="Status" subtitle="Laatste 12 maanden">
          <SegmentBar parts={statusParts} />
        </ChartCard>
      </div>
    );
  }

  const isIncident = group.key === "incidenten";
  return (
    <>
      {header}
      <section className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">{tiles}</section>
      {charts}

      <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <input type="hidden" name="groep" value={group.key} />
        <Field label="Zoeken">
          <input name="q" defaultValue={sp.q} className="input w-48" placeholder="Omschrijving, nr., project…" />
        </Field>
        {types.length > 1 && (
          <Field label="Soort">
            <Select name="soort" options={types.map((t) => ({ value: t, label: REPORT_TYPE_LABEL[t] }))} defaultValue={sp.soort} placeholder="Alle" />
          </Field>
        )}
        {isIncident && (
          <>
            <Field label="Verzuim">
              <select name="verzuim" defaultValue={sp.verzuim ?? ""} className="input">
                <option value="">Alle</option>
                <option value="ja">Met verzuim</option>
                <option value="kort">1–15 dagen</option>
                <option value="lang">Meer dan 15 dagen</option>
              </select>
            </Field>
            <Field label="Categorie ongeval">
              <Select name="categorie" options={ACCIDENT_CATEGORIES.map((c) => ({ value: c, label: c }))} defaultValue={sp.categorie} placeholder="Alle" />
            </Field>
          </>
        )}
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
        <Link href={`/meldingen?groep=${group.key}`} className="btn-link self-center">
          Wissen
        </Link>
      </form>

      {reports.length === 0 ? (
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
                <th>{isIncident ? "Verzuim" : "Ernst"}</th>
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
                    {r.accidentCategory && <div className="text-xs text-neutral-500">{r.accidentCategory}</div>}
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
                  <td>
                    {isIncident ? (
                      r.absence ? (
                        <Badge className={ABSENCE_CLASS[r.absence]}>
                          {r.absence === "SHORT" ? "1–15 dagen" : "> 15 dagen"}
                          {r.lostDays ? ` (${r.lostDays})` : ""}
                        </Badge>
                      ) : (
                        <span className="text-xs text-neutral-400">—</span>
                      )
                    ) : (
                      r.severity && <Badge className={REPORT_SEVERITY_CLASS[r.severity]}>{REPORT_SEVERITY_LABEL[r.severity]}</Badge>
                    )}
                  </td>
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
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-neutral-500">
        {reports.length} melding{reports.length === 1 ? "" : "en"} in &lsquo;{group.label}&rsquo;
        {isIncident && (
          <>
            {" "}
            · {ABSENCE_LABEL.SHORT.toLowerCase()} en {ABSENCE_LABEL.LONG.toLowerCase()} worden apart geteld
          </>
        )}
        .
      </p>
    </>
  );
}
