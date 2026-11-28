import Link from "next/link";
import type { ActionSource } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { getLookups, getRequirementOptions } from "@/lib/lookups";
import { formatDate, isOverdue } from "@/lib/format";
import { actionOrigin } from "@/lib/action-origin";
import { actionOriginInclude, actionWhere, type ActionSearch } from "@/lib/action-filters";
import { ACTION_KIND_LABEL, ACTION_PRIORITY_LABEL, ACTION_SOURCE_LABEL, ACTION_STATUS_CLASS, ACTION_STATUS_LABEL, options } from "@/lib/labels";
import { Badge, Disclosure, EmptyState, Field, PageHeader, Select } from "@/components/ui";
import { FindingOverview } from "@/components/finding-overview";
import { BarList, ChartCard, Columns, lastMonths, monthKey, SegmentBar } from "@/components/charts";
import { ActionForm } from "@/components/action-form";
import { createAction } from "./actions";
import { Filters } from "@/components/mobile-filters";

export const metadata = { title: "Acties" };

export default async function ActionsPage({ searchParams }: { searchParams: Promise<ActionSearch> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab = (sp as { tab?: string }).tab === "audit" ? "audit" : "acties";
  const openFindings = await prisma.auditFinding.count({ where: { status: "OPEN" } });
  const tabs = (
    <nav className="tabs mb-6 flex gap-1 border-b border-neutral-200 print:hidden" aria-label="Acties en maatregelen">
      {[
        { key: "acties", href: "/acties", label: "Acties en maatregelen" },
        { key: "audit", href: "/acties?tab=audit", label: "Auditbevindingen", n: openFindings },
      ].map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`-mb-px border-b-2 px-3 py-2 text-sm no-underline ${t.key === tab ? "border-brand-red font-semibold text-brand-red-dark" : "border-transparent text-neutral-600 hover:text-neutral-900"}`}
        >
          {t.label}
          {t.n ? <span className="ml-1.5 rounded-full bg-neutral-100 px-1.5 text-xs text-neutral-600 tabular-nums">{t.n}</span> : null}
        </Link>
      ))}
    </nav>
  );
  if (tab === "audit") {
    return (
      <>
        <PageHeader
          title="Actielijst"
          description="Auditbevindingen en hun opvolging: correcties (direct oplossen) en corrigerende maatregelen (oorzaak wegnemen, met oorzaakanalyse). De bevinding zelf handel je af bij de audit."
        />
        {tabs}
        <FindingOverview status={sp.status} />
      </>
    );
  }
  const status = sp.status ?? "lopend";
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const yearAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));

  const [actions, summary, done, lookups, requirementGroups] = await Promise.all([
    prisma.action.findMany({
      where: actionWhere(sp, user.id),
      orderBy: [{ deadline: { sort: "asc", nulls: "last" } }, { number: "desc" }],
      include: { owner: { select: { name: true } }, discipline: { select: { name: true } }, location: { select: { name: true } }, ...actionOriginInclude },
      take: 1000,
    }),
    prisma.action.findMany({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
      select: { status: true, deadline: true, ownerId: true, ownerText: true, source: true, kind: true, rootCause: true },
    }),
    prisma.action.findMany({
      where: { OR: [{ completedAt: { gte: yearAgo } }, { createdAt: { gte: yearAgo } }] },
      select: { createdAt: true, completedAt: true, status: true },
    }),
    getLookups(),
    getRequirementOptions(),
  ]);

  const in7 = new Date(today.getTime() + 7 * 86_400_000);
  const overdue = summary.filter((a) => a.deadline && a.deadline < today).length;
  const thisWeek = summary.filter((a) => a.deadline && a.deadline >= today && a.deadline < in7).length;
  const noOwner = summary.filter((a) => !a.ownerId && !a.ownerText).length;
  const months = lastMonths(12);
  const flow = [
    { name: "Nieuw", values: months.map((m) => done.filter((a) => monthKey(a.createdAt) === m.key).length) },
    { name: "Gereed", values: months.map((m) => done.filter((a) => a.completedAt && monthKey(a.completedAt) === m.key).length) },
  ];
  const bySource = (Object.keys(ACTION_SOURCE_LABEL) as ActionSource[])
    .map((s) => ({ label: ACTION_SOURCE_LABEL[s], value: summary.filter((a) => a.source === s).length, href: `/acties?bron=${s}` }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
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
        title="Actielijst"
        description="Alle acties op één plek: taken, directe correcties, corrigerende maatregelen en verbeteringen — uit meldingen (afwijkingen, klachten, ongevallen), audits, risico's, wet- en regelgeving, milieuaspecten, CO2 en de directiebeoordeling."
        actions={
          <>
            {can(user.role, "actions.editAny") && (
              <Link href="/acties/import" className="btn-secondary">
                Importeren uit Excel
              </Link>
            )}
            <a href={`/acties/export${exportQuery ? `?${exportQuery}` : ""}`} className="btn-secondary">
              Exporteren (CSV)
            </a>
          </>
        }
      />
      {tabs}

      <section className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Tile href="/acties" n={summary.length} label="lopend" />
        <Tile href="/acties?status=verlopen" n={overdue} label="deadline verstreken" tone={overdue ? "text-brand-red" : ""} />
        <Tile href="/acties?status=week" n={thisWeek} label="deadline binnen 7 dagen" tone={thisWeek ? "text-amber-700" : ""} />
        <Tile href="/acties?eigenaar=geen" n={noOwner} label="zonder eigenaar" tone={noOwner ? "text-amber-700" : ""} />
        <Tile href="/acties?eigenaar=mij" n={summary.filter((a) => a.ownerId === user.id).length} label="mijn lopende acties" />
        <Tile
          href="/acties?soort=CORRECTIVE&oorzaak=geen"
          n={summary.filter((a) => a.kind === "CORRECTIVE" && !a.rootCause?.trim()).length}
          label="corrigerende maatregel zonder oorzaak"
          tone={summary.some((a) => a.kind === "CORRECTIVE" && !a.rootCause?.trim()) ? "text-brand-red" : ""}
        />
      </section>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <ChartCard title="Nieuw en gereed per maand" subtitle="Laatste 12 maanden" className="lg:col-span-2">
          <Columns periods={months.map((m) => ({ label: m.label, title: m.title }))} series={flow} />
        </ChartCard>
        <div className="grid gap-4">
          <ChartCard title="Lopende acties">
            <SegmentBar
              parts={[
                { label: "Te laat", value: overdue, color: "#ec4647", href: "/acties?status=verlopen" },
                { label: "Binnen 7 dagen", value: thisWeek, color: "#f2a600", href: "/acties?status=week" },
                { label: "Op schema", value: summary.length - overdue - thisWeek, color: "#257de0" },
              ]}
            />
          </ChartCard>
          <ChartCard title="Lopend per bron">
            <BarList items={bySource} empty="Geen lopende acties." />
          </ChartCard>
        </div>
      </div>

      {can(user.role, "actions.create") && (
        <div className="mb-6">
          <Disclosure summary="Nieuwe actie">
            <ActionForm formAction={createAction} lookups={lookups} requirementGroups={requirementGroups} submitLabel="Actie aanmaken" />
          </Disclosure>
        </div>
      )}

      <Filters>
        <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
          <Field label="Zoeken">
            <input name="q" defaultValue={sp.q} className="input w-48" placeholder="Actie, nr., eigenaar…" />
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={status} className="input">
              <option value="lopend">Lopend (open + in uitvoering)</option>
              <option value="verlopen">Deadline verstreken</option>
              <option value="week">Deadline binnen 7 dagen</option>
              {options(ACTION_STATUS_LABEL).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
              <option value="alle">Alle</option>
            </select>
          </Field>
          <Field label="Bron">
            <Select name="bron" options={options(ACTION_SOURCE_LABEL)} defaultValue={sp.bron} placeholder="Alle" />
          </Field>
          <Field label="Soort">
            <Select name="soort" options={options(ACTION_KIND_LABEL)} defaultValue={sp.soort} placeholder="Alle" />
          </Field>
          <Field label="Prioriteit">
            <Select name="prio" options={options(ACTION_PRIORITY_LABEL)} defaultValue={sp.prio} placeholder="Alle" />
          </Field>
          <Field label="Eigenaar">
            <Select
              name="eigenaar"
              options={[{ value: "mij", label: "Mijn acties" }, { value: "geen", label: "Zonder eigenaar" }, ...lookups.users]}
              defaultValue={sp.eigenaar}
              placeholder="Iedereen"
            />
          </Field>
          <Field label="Bedrijfsonderdeel">
            <Select name="discipline" options={lookups.disciplines} defaultValue={sp.discipline} placeholder="Alle" />
          </Field>
          <Field label="Vestiging">
            <Select name="locatie" options={lookups.locations} defaultValue={sp.locatie} placeholder="Alle" />
          </Field>
          <button className="btn-secondary">Filteren</button>
          <Link href="/acties" className="btn-link self-center">
            Wissen
          </Link>
        </form>
      </Filters>

      {actions.length === 0 ? (
        <EmptyState>Geen acties gevonden met deze filters.</EmptyState>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Actie</th>
                <th>Bron</th>
                <th>Eigenaar</th>
                <th>Deadline</th>
                <th>Status</th>
                <th>Prio</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => {
                const late = (a.status === "OPEN" || a.status === "IN_PROGRESS") && isOverdue(a.deadline);
                const origin = actionOrigin(a);
                return (
                  <tr key={a.id}>
                    <td className="font-mono text-xs whitespace-nowrap text-neutral-500">
                      #{a.number}
                      {a.externalRef && <div>{a.externalRef}</div>}
                    </td>
                    <td>
                      <Link href={`/acties/${a.id}`} className="font-medium">
                        {a.title}
                      </Link>
                      <div className="text-xs text-neutral-500">
                        {ACTION_KIND_LABEL[a.kind]}
                        {(a.discipline || a.location) && ` · ${[a.discipline?.name, a.location?.name].filter(Boolean).join(" · ")}`}
                      </div>
                    </td>
                    <td className="text-xs">
                      <div>{ACTION_SOURCE_LABEL[a.source]}</div>
                      {origin && (
                        <Link href={origin.href} className="font-mono">
                          {origin.code}
                        </Link>
                      )}
                    </td>
                    <td className="text-sm">{a.owner?.name ?? a.ownerText ?? <span className="text-amber-700">Geen eigenaar</span>}</td>
                    <td className={`whitespace-nowrap ${late ? "font-semibold text-brand-red" : ""}`}>
                      {formatDate(a.deadline)}
                      {late && " ⚠"}
                    </td>
                    <td>
                      <Badge className={ACTION_STATUS_CLASS[a.status]}>{ACTION_STATUS_LABEL[a.status]}</Badge>
                    </td>
                    <td className={a.priority === "HIGH" ? "font-semibold text-brand-red-dark" : "text-neutral-600"}>{ACTION_PRIORITY_LABEL[a.priority]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-neutral-500">{actions.length} actie(s) getoond.</p>
    </>
  );
}
