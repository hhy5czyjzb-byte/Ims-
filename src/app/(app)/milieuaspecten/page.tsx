import Link from "next/link";
import type { AspectType } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { getLookups } from "@/lib/lookups";
import { getAspectLinkOptions } from "@/lib/legal-links";
import { getSignificanceThreshold } from "@/lib/settings";
import { formatDate, isOverdue } from "@/lib/format";
import { aspectCode, determineSignificance } from "@/lib/aspects";
import { aspectWhere, type AspectSearch } from "@/lib/aspect-filters";
import { ASPECT_TYPE_LABEL, SITUATION_CLASS, SITUATION_LABEL, options } from "@/lib/labels";
import { Badge, Disclosure, EmptyState, Field, PageHeader, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { AspectForm } from "@/components/aspect-form";
import { createAspect, setSignificanceThreshold } from "./actions";

export const metadata = { title: "Milieuaspecten" };

export default async function AspectsPage({ searchParams }: { searchParams: Promise<AspectSearch> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const canEdit = can(user.role, "aspects.edit");
  const threshold = await getSignificanceThreshold();

  const [aspects, allActive, lookups, processes, linkOptions] = await Promise.all([
    prisma.environmentalAspect.findMany({
      where: aspectWhere(sp, user.id),
      orderBy: [{ significant: "desc" }, { score: { sort: "desc", nulls: "last" } }, { activity: "asc" }],
      include: {
        owner: { select: { name: true } },
        discipline: { select: { name: true } },
        location: { select: { name: true } },
        _count: { select: { legalRequirements: true, actions: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } } } } },
      },
      take: 3000,
    }),
    prisma.environmentalAspect.findMany({ where: { active: true }, select: { aspectType: true, significant: true } }),
    getLookups(),
    prisma.process.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    canEdit ? getAspectLinkOptions() : Promise.resolve(null),
  ]);

  const significantCount = allActive.filter((a) => a.significant).length;
  const byType = (Object.keys(ASPECT_TYPE_LABEL) as AspectType[])
    .map((t) => ({ t, total: allActive.filter((a) => a.aspectType === t).length, sig: allActive.filter((a) => a.aspectType === t && a.significant).length }))
    .filter((x) => x.total > 0);
  const exportQuery = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader
        title="Milieuaspecten"
        description="Register van milieuaspecten en -effecten per activiteit, discipline en locatie (ISO 14001 6.1.2), met scoring en bepaling van significantie."
        actions={
          <>
            {canEdit && (
              <Link href="/milieuaspecten/import" className="btn-secondary">
                Importeren uit Excel
              </Link>
            )}
            <a href={`/milieuaspecten/export${exportQuery ? `?${exportQuery}` : ""}`} className="btn-secondary">
              Exporteren (CSV)
            </a>
          </>
        }
      />

      <section className="card mb-6">
        <div className="flex flex-wrap items-start gap-6">
          <div>
            <div className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Significant</div>
            <Link href="/milieuaspecten?significant=ja" className="text-3xl font-bold text-brand-red no-underline">
              {significantCount}
            </Link>
            <span className="ml-1 text-sm text-neutral-500">van {allActive.length} aspecten</span>
          </div>
          <div className="flex flex-1 flex-wrap gap-2">
            {byType.map((x) => (
              <Link
                key={x.t}
                href={`/milieuaspecten?type=${x.t}`}
                className="rounded-md border border-neutral-200 px-3 py-2 text-sm text-inherit no-underline hover:border-brand-red hover:no-underline"
              >
                <div className="font-medium">{ASPECT_TYPE_LABEL[x.t]}</div>
                <div className="text-xs text-neutral-500">
                  {x.total} aspect{x.total === 1 ? "" : "en"}
                  {x.sig > 0 && <span className="font-semibold text-brand-red"> · {x.sig} significant</span>}
                </div>
              </Link>
            ))}
          </div>
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          Significant bij score F × E × O ≥ {threshold}, een bindende verplichting, of zorgen bij belanghebbenden — of handmatig bepaald door KAM.
        </p>
      </section>

      {canEdit && linkOptions && (
        <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_22rem]">
          <Disclosure summary="Milieuaspect toevoegen">
            <AspectForm formAction={createAspect} lookups={lookups} linkOptions={linkOptions} threshold={threshold} submitLabel="Opslaan" />
          </Disclosure>
          <Disclosure summary="Drempel significantie">
            <Form key={threshold} action={setSignificanceThreshold} className="space-y-2">
              <Field label="Significant vanaf score (1–125)" hint="Bij wijzigen wordt de significantie van alle niet-handmatig bepaalde aspecten herberekend.">
                <input name="threshold" type="number" min={1} max={125} required defaultValue={threshold} className="input" />
              </Field>
              <SubmitButton variant="secondary">Drempel opslaan</SubmitButton>
            </Form>
          </Disclosure>
        </div>
      )}

      <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <Field label="Zoeken">
          <input name="q" defaultValue={sp.q} className="input w-52" placeholder="Activiteit, aspect, effect…" />
        </Field>
        <Field label="Significant">
          <Select
            name="significant"
            options={[
              { value: "ja", label: "Significant" },
              { value: "nee", label: "Niet significant" },
            ]}
            defaultValue={sp.significant}
            placeholder="Alle"
          />
        </Field>
        <Field label="Type">
          <Select name="type" options={options(ASPECT_TYPE_LABEL)} defaultValue={sp.type} placeholder="Alle" />
        </Field>
        <Field label="Situatie">
          <Select name="situatie" options={options(SITUATION_LABEL)} defaultValue={sp.situatie} placeholder="Alle" />
        </Field>
        <Field label="Proces">
          <Select
            name="proces"
            options={processes.map((p) => ({ value: p.id, label: p.name }))}
            defaultValue={sp.proces}
            placeholder="Alle"
            className="max-w-56"
          />
        </Field>
        <Field label="Discipline">
          <Select name="discipline" options={lookups.disciplines} defaultValue={sp.discipline} placeholder="Alle" />
        </Field>
        <Field label="Locatie">
          <Select name="locatie" options={lookups.locations} defaultValue={sp.locatie} placeholder="Alle" />
        </Field>
        <Field label="Eigenaar">
          <Select name="eigenaar" options={[{ value: "mij", label: "Mijn aspecten" }, ...lookups.users]} defaultValue={sp.eigenaar} placeholder="Iedereen" />
        </Field>
        <Field label="CO2">
          <Select name="co2" options={[{ value: "ja", label: "CO2-relevant" }]} defaultValue={sp.co2} placeholder="Alle" />
        </Field>
        <button className="btn-secondary">Filteren</button>
        <Link href="/milieuaspecten" className="btn-link self-center">
          Wissen
        </Link>
      </form>

      {aspects.length === 0 ? (
        <EmptyState>
          Geen milieuaspecten gevonden.
          {canEdit && allActive.length === 0 && (
            <>
              {" "}
              Begin met <Link href="/milieuaspecten/import">importeren uit Excel</Link> of voeg een aspect toe.
            </>
          )}
        </EmptyState>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Activiteit → aspect → effect</th>
                <th>Situatie</th>
                <th className="text-center">F·E·O</th>
                <th className="text-center">Score</th>
                <th>Significantie</th>
                <th>Eigenaar</th>
                <th className="text-center">Open acties</th>
                <th>Beoordelen vóór</th>
              </tr>
            </thead>
            <tbody>
              {aspects.map((a) => {
                const sig = determineSignificance({
                  score: a.score,
                  threshold,
                  legalApplies: a.legalApplies || a._count.legalRequirements > 0,
                  stakeholderConcern: a.stakeholderConcern,
                  manual: a.significanceManual ? { significant: a.significant, reason: a.significanceReason } : null,
                });
                const late = a.active && isOverdue(a.reviewDate);
                return (
                  <tr key={a.id} className={a.active ? "" : "opacity-50"}>
                    <td className="font-mono text-xs whitespace-nowrap">
                      {aspectCode(a.number)}
                      {a.externalRef && <div className="text-neutral-400">{a.externalRef}</div>}
                    </td>
                    <td>
                      <div className="text-xs text-neutral-500">{a.activity}</div>
                      <Link href={`/milieuaspecten/${a.id}`} className="font-medium">
                        {a.aspect}
                      </Link>
                      {a.impact && <div className="text-xs text-neutral-600">→ {a.impact}</div>}
                      <div className="text-xs text-neutral-400">
                        {ASPECT_TYPE_LABEL[a.aspectType]} · {a.discipline?.name ?? "Bedrijfsbreed"} · {a.location?.name ?? "Alle locaties"}
                        {a.co2Relevant && " · CO2"}
                      </div>
                    </td>
                    <td>
                      <Badge className={SITUATION_CLASS[a.situation]}>{SITUATION_LABEL[a.situation]}</Badge>
                    </td>
                    <td className="text-center text-xs whitespace-nowrap text-neutral-600 tabular-nums">
                      {a.frequency && a.severity && a.extent ? `${a.frequency}·${a.severity}·${a.extent}` : "—"}
                    </td>
                    <td className="text-center font-semibold tabular-nums">{a.score ?? "—"}</td>
                    <td title={sig.reasons.join(" · ")}>
                      {a.significant ? (
                        <Badge className="bg-brand-red text-white">Significant</Badge>
                      ) : (
                        <Badge className="bg-neutral-100 text-neutral-600">Niet significant</Badge>
                      )}
                      {a.significanceManual && <span className="ml-1 text-xs text-neutral-500">(handm.)</span>}
                    </td>
                    <td>{a.owner?.name ?? <span className={a.significant ? "text-brand-red" : "text-neutral-400"}>Geen</span>}</td>
                    <td
                      className={`text-center tabular-nums ${a._count.actions === 0 ? (a.significant && !a.controls ? "font-semibold text-brand-red" : "text-neutral-300") : ""}`}
                      title={a.significant && !a.controls && a._count.actions === 0 ? "Significant, zonder beheersmaatregelen of actie" : undefined}
                    >
                      {a._count.actions}
                    </td>
                    <td className={`whitespace-nowrap ${late ? "font-semibold text-brand-red" : ""}`}>
                      {formatDate(a.reviewDate)}
                      {late && " ⚠"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-neutral-500">
        {aspects.length} aspect{aspects.length === 1 ? "" : "en"} getoond. Beweeg over de significantie voor de reden. Rood bij open acties = significant zonder
        beheersmaatregelen of actie.
      </p>
    </>
  );
}
