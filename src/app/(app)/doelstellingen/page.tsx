import Link from "next/link";
import type { ObjectiveCategory, ObjectiveStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { formatDate } from "@/lib/format";
import { OBJECTIVE_CATEGORY_CLASS, OBJECTIVE_CATEGORY_LABEL, OBJECTIVE_STATUS_CLASS, OBJECTIVE_STATUS_LABEL, options } from "@/lib/labels";
import { smartCheck, BAD, FINAL_STATUSES, GOOD, STATUS_COLOR, STATUS_ORDER, WARN, objectiveDisplayCode, objectiveProgress } from "@/lib/objectives";
import { objectiveWhere, type ObjectiveSearch } from "@/lib/objective-filters";
import { getObjectiveLookups } from "@/lib/objective-data";
import { Badge, Disclosure, EmptyState, Field, PageHeader, ProgressBar, Select } from "@/components/ui";
import { ChartCard, SegmentBar } from "@/components/charts";
import { ObjectiveForm } from "@/components/objective-form";
import { SmartBadge } from "@/components/smart-badge";
import { createObjective } from "./actions";
import { Filters } from "@/components/mobile-filters";

export const metadata = { title: "Doelstellingen" };

function Tile({ href, n, label, tone }: { href: string; n: number | string; label: string; tone?: string }) {
  return (
    <Link href={href} className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-inherit no-underline hover:border-brand-red hover:no-underline">
      <div className={`text-2xl font-bold tabular-nums ${tone ?? ""}`}>{n}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </Link>
  );
}

/** Per categorie een gestapelde balk naar status (2px tussenruimte, afgeronde uiteinden), met aantallen. */
function CategoryStatusChart({ rows }: { rows: { category: ObjectiveCategory; status: ObjectiveStatus }[] }) {
  const cats = (Object.keys(OBJECTIVE_CATEGORY_LABEL) as ObjectiveCategory[]).filter((c) => rows.some((r) => r.category === c));
  if (!cats.length) return <p className="text-sm text-neutral-500">Nog geen doelstellingen.</p>;
  const max = Math.max(...cats.map((c) => rows.filter((r) => r.category === c).length));
  const used = STATUS_ORDER.filter((s) => rows.some((r) => r.status === s));
  return (
    <div>
      <ul className="space-y-2 text-sm">
        {cats.map((c) => {
          const list = rows.filter((r) => r.category === c);
          return (
            <li key={c} className="grid grid-cols-[minmax(0,12rem)_1fr_2.5rem] items-center gap-2">
              <Link
                href={`/doelstellingen?categorie=${c}&status=alle`}
                className="truncate text-neutral-800 no-underline hover:underline"
                title={OBJECTIVE_CATEGORY_LABEL[c]}
              >
                {OBJECTIVE_CATEGORY_LABEL[c]}
              </Link>
              <span className="flex h-3 gap-[2px] overflow-hidden rounded-[4px]" style={{ width: `${(list.length / max) * 100}%` }}>
                {STATUS_ORDER.map((s) => {
                  const n = list.filter((r) => r.status === s).length;
                  if (!n) return null;
                  return (
                    <span
                      key={s}
                      className="group relative block h-full"
                      style={{ flex: n, background: STATUS_COLOR[s] }}
                      title={`${OBJECTIVE_STATUS_LABEL[s]}: ${n}`}
                    />
                  );
                })}
              </span>
              <span className="text-right text-neutral-700 tabular-nums">{list.length}</span>
            </li>
          );
        })}
      </ul>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-700">
        {used.map((s) => (
          <li key={s} className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: STATUS_COLOR[s] }} />
            {OBJECTIVE_STATUS_LABEL[s]}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function ObjectivesPage({ searchParams }: { searchParams: Promise<ObjectiveSearch> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const canEdit = can(user.role, "objectives.edit");
  const now = new Date();
  const [list, all, lookups] = await Promise.all([
    prisma.objective.findMany({
      where: objectiveWhere(sp, user.id, now),
      orderBy: [{ category: "asc" }, { deadline: { sort: "asc", nulls: "last" } }, { number: "asc" }],
      include: { owner: { select: { name: true } }, discipline: { select: { name: true } }, _count: { select: { actions: true } } },
      take: 1000,
    }),
    prisma.objective.findMany({
      where: { active: true, status: { not: "CANCELLED" } },
      select: { category: true, status: true, nextReviewDate: true, deadline: true },
    }),
    getObjectiveLookups(),
  ]);
  const count = (set: ObjectiveStatus[]) => all.filter((o) => set.includes(o.status)).length;
  const finals = all.filter((o) => FINAL_STATUSES.includes(o.status));
  const achievedPct = finals.length ? Math.round((finals.filter((o) => o.status === "ACHIEVED").length / finals.length) * 100) : null;
  const notSmart = all.filter((o) => !smartCheck(o).ok).length;
  const overdue = all.filter((o) => o.nextReviewDate && o.nextReviewDate < now && !FINAL_STATUSES.includes(o.status)).length;
  const exportQuery = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader
        title="Doelstellingen"
        description="Kwaliteits-, milieu-, VGM- en CO2-doelstellingen (ISO 9001 en 14001 §6.2, VCA, CO2-prestatieladder): SMART vastgelegd, met eigenaar, termijn en een beoordeling van de voortgang (historie = bewijs)."
        actions={
          <>
            {canEdit && (
              <Link href="/doelstellingen/import" className="btn-secondary">
                Importeren uit Excel
              </Link>
            )}
            <a href={`/doelstellingen/export${exportQuery ? `?${exportQuery}` : ""}`} className="btn-secondary">
              Exporteren (CSV)
            </a>
          </>
        }
      />

      {canEdit && (
        <div className="mb-6">
          <Disclosure summary="Doelstelling toevoegen">
            <ObjectiveForm formAction={createObjective} lookups={lookups} submitLabel="Doelstelling opslaan" />
          </Disclosure>
        </div>
      )}

      <section className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <Tile href="/doelstellingen?status=alle" n={all.length} label="doelstellingen (actief)" />
        <Tile href="/doelstellingen?status=ON_TRACK" n={count(GOOD)} label="op koers of behaald" tone="text-green-700" />
        <Tile href="/doelstellingen?status=aandacht" n={count(WARN)} label="aandacht / deels" tone={count(WARN) ? "text-amber-700" : ""} />
        <Tile href="/doelstellingen?status=OFF_TRACK" n={count(BAD)} label="achter / niet behaald" tone={count(BAD) ? "text-brand-red" : ""} />
        <Tile href="/doelstellingen?status=NOT_ASSESSED" n={count(["NOT_ASSESSED"])} label="nog niet beoordeeld" />
        <Tile href="/doelstellingen?status=alle&smart=nee" n={notSmart} label="nog niet SMART" tone={notSmart ? "text-amber-700" : ""} />
        <Tile href="/doelstellingen?toetsing=verlopen" n={overdue} label="beoordeling verlopen" tone={overdue ? "text-brand-red" : ""} />
      </section>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <ChartCard title="Status van alle doelstellingen" subtitle={achievedPct === null ? "Actieve doelstellingen" : `Afgerond: ${achievedPct}% behaald`}>
          <SegmentBar
            parts={STATUS_ORDER.filter((s) => s !== "CANCELLED").map((s) => ({
              label: OBJECTIVE_STATUS_LABEL[s],
              value: all.filter((o) => o.status === s).length,
              color: STATUS_COLOR[s],
              href: `/doelstellingen?status=${s}`,
            }))}
          />
        </ChartCard>
        <ChartCard title="Per categorie, naar status" subtitle="Welke doelstellingen lopen goed, en welke niet?" className="lg:col-span-2">
          <CategoryStatusChart rows={all} />
        </ChartCard>
      </div>

      <Filters>
        <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
          <Field label="Zoeken">
            <input name="q" defaultValue={sp.q} className="input w-48" placeholder="Doelstelling, indicator…" />
          </Field>
          <Field label="Categorie">
            <Select name="categorie" options={options(OBJECTIVE_CATEGORY_LABEL)} defaultValue={sp.categorie} placeholder="Alle" />
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={sp.status ?? "lopend"} className="input">
              <option value="lopend">Lopend</option>
              <option value="aandacht">Aandacht nodig of achter</option>
              <option value="afgerond">Afgerond (behaald / deels / niet)</option>
              {options(OBJECTIVE_STATUS_LABEL).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
              <option value="alle">Alle</option>
            </select>
          </Field>
          <Field label="Eigenaar">
            <Select
              name="eigenaar"
              options={[{ value: "mij", label: "Mijn doelstellingen" }, ...lookups.users]}
              defaultValue={sp.eigenaar}
              placeholder="Alle"
            />
          </Field>
          <Field label="Bedrijfsonderdeel">
            <Select name="discipline" options={lookups.disciplines} defaultValue={sp.discipline} placeholder="Alle" />
          </Field>
          <Field label="Norm">
            <Select name="norm" options={lookups.norms} defaultValue={sp.norm} placeholder="Alle" />
          </Field>
          <Field label="Deadline in jaar">
            <input name="jaar" defaultValue={sp.jaar} inputMode="numeric" className="input w-24" placeholder="Alle" />
          </Field>
          <button className="btn-secondary">Filteren</button>
          <Link href="/doelstellingen" className="btn-link self-center">
            Wissen
          </Link>
        </form>
      </Filters>

      {list.length === 0 ? (
        <EmptyState>Geen doelstellingen met deze filters.{canEdit && " Voeg er een toe of importeer je lijst uit Excel."}</EmptyState>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Doelstelling</th>
                <th>Categorie</th>
                <th>SMART</th>
                <th>Eigenaar</th>
                <th>Termijn</th>
                <th className="w-40">Voortgang</th>
                <th>Status</th>
                <th>Volgende beoordeling</th>
              </tr>
            </thead>
            <tbody>
              {list
                .filter((o) => sp.smart !== "nee" || !smartCheck(o).ok)
                .map((o) => {
                  const prog = objectiveProgress(
                    o.baselineValue === null ? null : Number(o.baselineValue),
                    o.targetValue === null ? null : Number(o.targetValue),
                    o.currentValue === null ? null : Number(o.currentValue),
                  );
                  const late = o.nextReviewDate && o.nextReviewDate < now && !FINAL_STATUSES.includes(o.status) && o.status !== "CANCELLED";
                  return (
                    <tr key={o.id} className={o.active ? "" : "text-neutral-400"}>
                      <td className="font-mono text-xs whitespace-nowrap">
                        <Link href={`/doelstellingen/${o.id}`}>{objectiveDisplayCode(o)}</Link>
                      </td>
                      <td>
                        <Link href={`/doelstellingen/${o.id}`} className="font-medium">
                          {o.title}
                        </Link>
                        {(o.indicator || o.targetText) && (
                          <div className="text-xs text-neutral-500">{[o.indicator, o.targetText && `doel: ${o.targetText}`].filter(Boolean).join(" · ")}</div>
                        )}
                      </td>
                      <td>
                        <Badge className={OBJECTIVE_CATEGORY_CLASS[o.category]}>{OBJECTIVE_CATEGORY_LABEL[o.category]}</Badge>
                        {o.discipline && <div className="text-xs text-neutral-500">{o.discipline.name}</div>}
                      </td>
                      <td>
                        <SmartBadge o={o} />
                      </td>
                      <td className="text-xs">{o.owner?.name ?? o.ownerText ?? "—"}</td>
                      <td className="text-xs whitespace-nowrap">{o.deadline ? formatDate(o.deadline) : (o.termText ?? "—")}</td>
                      <td>{prog ? <ProgressBar value={prog.pct} /> : <span className="text-xs text-neutral-400">—</span>}</td>
                      <td>
                        <Badge className={OBJECTIVE_STATUS_CLASS[o.status]}>{OBJECTIVE_STATUS_LABEL[o.status]}</Badge>
                      </td>
                      <td className={`text-xs whitespace-nowrap ${late ? "font-semibold text-brand-red" : ""}`}>
                        {FINAL_STATUSES.includes(o.status) ? "—" : formatDate(o.nextReviewDate)}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-neutral-500">
        {list.length} doelstelling(en). De status verandert alleen via een beoordeling op de detailpagina (door QHSE of de eigenaar).
      </p>
    </>
  );
}
