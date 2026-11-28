import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { getLookups } from "@/lib/lookups";
import { getAspectLinkOptions, getAspectSuggestions } from "@/lib/legal-links";
import {
  ASPECT_RISK_LEVEL_CLASS,
  ASPECT_RISK_LEVEL_LABEL,
  aspectDisplayCode,
  aspectRisk,
  aspectRiskLevel,
  PRIORITY_SIGNAL_LABEL,
  prioritySignal,
} from "@/lib/aspects";
import { aspectMatches, aspectWhere, type AspectSearch } from "@/lib/aspect-filters";
import { countAspects } from "@/lib/aspect-stats";
import { ASPECT_PRIORITY_CLASS, ASPECT_PRIORITY_LABEL, ASPECT_PRIORITY_SHORT, ASPECT_SITE_TYPE_LABEL, options } from "@/lib/labels";
import { Badge, Disclosure, EmptyState, Field, PageHeader, Select } from "@/components/ui";
import { AspectForm } from "@/components/aspect-form";
import { AspectNav } from "@/components/aspect-nav";
import { createAspect } from "./actions";
import { getSignificanceRule } from "@/lib/aspect-settings";
import { describeSignificanceRule } from "@/lib/aspects";

export const metadata = { title: "Milieuaspecten" };

const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString("nl-NL", { maximumFractionDigits: 2 }));
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(String(v)));

export default async function AspectsPage({ searchParams }: { searchParams: Promise<AspectSearch> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const canEdit = can(user.role, "aspects.edit");
  const rule = await getSignificanceRule();

  const [rows, allActive, lookups, processes, linkOptions, suggestions] = await Promise.all([
    prisma.environmentalAspect.findMany({
      where: aspectWhere(sp, user.id),
      orderBy: [{ externalRef: { sort: "asc", nulls: "last" } }, { number: "asc" }],
      include: {
        owner: { select: { name: true } },
        _count: { select: { actions: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } } } } },
      },
      take: 5000,
    }),
    prisma.environmentalAspect.findMany({
      where: { active: true },
      select: {
        businessUnit: true,
        locationText: true,
        contextFactor: true,
        theme: true,
        siteType: true,
        inOperation: true,
        priority: true,
        significant: true,
        opportunity: true,
        origin: true,
        lifecycleSource: true,
        effectScore: true,
        exposure: true,
        probability: true,
      },
    }),
    getLookups(),
    prisma.process.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    canEdit ? getAspectLinkOptions() : Promise.resolve(null),
    getAspectSuggestions(),
  ]);
  const aspects = rows.filter((a) => aspectMatches(sp, a));
  const c = countAspects(allActive);
  const exportQuery = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  const list = (values: string[]) => values.map((v) => ({ value: v, label: v }));
  const origins = [...new Set(allActive.map((a) => a.origin).filter(Boolean) as string[])].sort();

  const Tile = ({ href, n, label, tone }: { href: string; n: number; label: string; tone?: string }) => (
    <Link href={href} className="rounded-md border border-neutral-200 px-3 py-2 text-inherit no-underline hover:border-brand-red hover:no-underline">
      <div className={`text-2xl font-bold tabular-nums ${tone ?? ""}`}>{n}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Milieuaspecten"
        description="Milieuaspectenregister (MAR) per bedrijfsonderdeel, locatie en activiteit (ISO 14001 6.1.2). Risico = effect × voorkomen × waarschijnlijkheid; de prio (H/M/L) is de eigen weging."
        actions={
          <>
            {canEdit && (
              <Link href="/milieuaspecten/significantie" className="btn-secondary">
                Significantie instellen
              </Link>
            )}
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
      <AspectNav />

      <section className="card mb-6">
        <h2 className="mb-1">Welke aspecten zijn belangrijk?</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Aspecten op locaties die in werking zijn ({c.total}). Significant bij {describeSignificanceRule(rule)}
          {canEdit && (
            <>
              {" "}
              (<Link href="/milieuaspecten/significantie">wijzigen</Link>)
            </>
          )}
          .
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          <Tile
            href="/milieuaspecten?significant=ja&werking=ja"
            n={c.significant}
            label={`significant (waarvan ${c.significantOpportunities} kansen)`}
            tone="text-brand-red"
          />
          <Tile href="/milieuaspecten?prio=HIGH&werking=ja" n={c.high} label="prio hoog" />
          <Tile href="/milieuaspecten?prio=MEDIUM&werking=ja" n={c.medium} label="prio middel" />
          <Tile href="/milieuaspecten?prio=LOW&werking=ja" n={c.low} label="prio laag" />
          <Tile href="/milieuaspecten?niveau=hoog%2B&werking=ja" n={c.riskHigh} label="risico hoog of zeer hoog" />
          <Tile href="/milieuaspecten?niveau=medium&werking=ja" n={c.riskMedium} label="risico middel" />
          <Tile
            href="/milieuaspecten?signaal=ja&werking=ja"
            n={c.signalLower + c.signalHigher}
            label="signaal prio ≠ risico"
            tone={c.signalLower + c.signalHigher ? "text-amber-700" : ""}
          />
          <Tile href="/milieuaspecten?levenscyclus=concept" n={c.lifecycleConcept} label="levenscyclus nog concept" />
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          {c.noPrio > 0 && `${c.noPrio} zonder prio · `}
          {c.notScored > 0 && `${c.notScored} nog niet gescoord · `}
          {c.opportunities} kansen · {c.projects} op projecten · {allActive.filter((a) => !a.inOperation).length} op locaties tijdelijk niet in werking (tellen
          niet mee)
        </p>
      </section>

      {canEdit && linkOptions && (
        <div className="mb-6">
          <Disclosure summary="Milieuaspect toevoegen">
            <AspectForm formAction={createAspect} lookups={lookups} linkOptions={linkOptions} suggestions={suggestions} rule={rule} submitLabel="Opslaan" />
          </Disclosure>
        </div>
      )}

      <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <Field label="Zoeken">
          <input name="q" defaultValue={sp.q} className="input w-48" placeholder="Nr., aspect, maatregel…" />
        </Field>
        <Field label="Bedrijfsonderdeel">
          <Select name="bu" options={list(suggestions.businessUnits)} defaultValue={sp.bu} placeholder="Alle" />
        </Field>
        <Field label="Locatie">
          <Select name="locatie" options={list(suggestions.locations)} defaultValue={sp.locatie} placeholder="Alle" className="max-w-56" />
        </Field>
        <Field label="Activiteit">
          <Select name="activiteit" options={list(suggestions.activities)} defaultValue={sp.activiteit} placeholder="Alle" className="max-w-56" />
        </Field>
        <Field label="Thema">
          <Select name="thema" options={list(suggestions.themes)} defaultValue={sp.thema} placeholder="Alle" />
        </Field>
        <Field label="Contextfactor">
          <Select name="context" options={list(suggestions.contextFactors)} defaultValue={sp.context} placeholder="Alle" className="max-w-56" />
        </Field>
        <Field label="Prio">
          <Select
            name="prio"
            options={[...options(ASPECT_PRIORITY_LABEL), { value: "geen", label: "Nog geen prio" }]}
            defaultValue={sp.prio}
            placeholder="Alle"
          />
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
        <Field label="Risiconiveau">
          <Select
            name="niveau"
            options={[
              { value: "hoog+", label: "Hoog of zeer hoog" },
              ...(["veryHigh", "high", "medium", "low"] as const).map((l) => ({ value: l, label: ASPECT_RISK_LEVEL_LABEL[l] })),
              { value: "geen", label: "Nog niet gescoord" },
            ]}
            defaultValue={sp.niveau}
            placeholder="Alle"
          />
        </Field>
        <Field label="Signaal">
          <Select
            name="signaal"
            options={[
              { value: "ja", label: "Prio ≠ risico" },
              { value: "lower", label: PRIORITY_SIGNAL_LABEL.lower },
              { value: "higher", label: PRIORITY_SIGNAL_LABEL.higher },
            ]}
            defaultValue={sp.signaal}
            placeholder="Alle"
          />
        </Field>
        <Field label="Kans / bedreiging">
          <Select
            name="soort"
            options={[
              { value: "bedreiging", label: "Bedreiging" },
              { value: "kans", label: "Kans" },
            ]}
            defaultValue={sp.soort}
            placeholder="Alle"
          />
        </Field>
        <Field label="Type">
          <Select name="type" options={options(ASPECT_SITE_TYPE_LABEL)} defaultValue={sp.type} placeholder="Alle" />
        </Field>
        <Field label="Locatie in werking">
          <Select
            name="werking"
            options={[
              { value: "ja", label: "In werking" },
              { value: "nee", label: "Tijdelijk niet in werking" },
            ]}
            defaultValue={sp.werking}
            placeholder="Alle"
          />
        </Field>
        <Field label="Eigenaar">
          <Select
            name="eigenaar"
            options={[{ value: "mij", label: "Mijn aspecten" }, ...list(suggestions.owners)]}
            defaultValue={sp.eigenaar}
            placeholder="Iedereen"
          />
        </Field>
        <Field label="Herkomst">
          <Select name="herkomst" options={list(origins)} defaultValue={sp.herkomst} placeholder="Alle" />
        </Field>
        <Field label="Proces">
          <Select
            name="proces"
            options={processes.map((p) => ({ value: p.id, label: p.name }))}
            defaultValue={sp.proces}
            placeholder="Alle"
            className="max-w-48"
          />
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
                <th>Nr.</th>
                <th>Bedrijfsonderdeel · locatie</th>
                <th>Activiteit → aspect → effect</th>
                <th className="text-center">E·B·W</th>
                <th>Risico</th>
                <th className="text-center">Prio</th>
                <th>Eigenaar</th>
                <th className="text-center">Open acties</th>
              </tr>
            </thead>
            <tbody>
              {aspects.map((a) => {
                const e = numOrNull(a.effectScore);
                const b = numOrNull(a.exposure);
                const w = numOrNull(a.probability);
                const risk = aspectRisk(e, b, w);
                const level = aspectRiskLevel(risk);
                const signal = prioritySignal({ priority: a.priority, risk, opportunity: a.opportunity });
                return (
                  <tr key={a.id} className={!a.active ? "opacity-50" : !a.inOperation ? "bg-neutral-50 text-neutral-500" : ""}>
                    <td className="font-mono text-xs whitespace-nowrap">
                      <Link href={`/milieuaspecten/${a.id}`}>{aspectDisplayCode(a)}</Link>
                    </td>
                    <td className="text-xs">
                      <div className="font-medium text-neutral-800">{a.businessUnit ?? "—"}</div>
                      <div className="text-neutral-500">
                        {a.locationText ?? "—"}
                        {a.siteType !== "SITE" && ` · ${ASPECT_SITE_TYPE_LABEL[a.siteType].toLowerCase()}`}
                        {!a.inOperation && " · niet in werking"}
                      </div>
                    </td>
                    <td>
                      <div className="text-xs text-neutral-500">
                        {a.activity}
                        {a.theme && ` · ${a.theme}`}
                      </div>
                      <Link href={`/milieuaspecten/${a.id}`} className="font-medium">
                        {a.aspect}
                      </Link>
                      {a.impact && <span className="text-xs text-neutral-600"> → {a.impact}</span>}
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {a.opportunity && <Badge className="bg-green-100 text-green-800">Kans</Badge>}
                        {a.co2Relevant && <Badge className="bg-sky-100 text-sky-800">CO2</Badge>}
                        {signal && <Badge className="bg-amber-50 text-amber-800 ring-1 ring-amber-300">⚠ {PRIORITY_SIGNAL_LABEL[signal]}</Badge>}
                      </div>
                    </td>
                    <td className="text-center text-xs whitespace-nowrap text-neutral-600 tabular-nums">
                      {risk === null ? "—" : `${fmt(e)}·${fmt(b)}·${fmt(w)}`}
                    </td>
                    <td className="whitespace-nowrap">
                      {level ? (
                        <Badge className={ASPECT_RISK_LEVEL_CLASS[level]}>
                          {fmt(risk)} {ASPECT_RISK_LEVEL_LABEL[level].toLowerCase()}
                        </Badge>
                      ) : (
                        <span className="text-xs text-neutral-400">niet gescoord</span>
                      )}
                    </td>
                    <td className="text-center">
                      {a.priority ? (
                        <Badge className={ASPECT_PRIORITY_CLASS[a.priority]}>{ASPECT_PRIORITY_SHORT[a.priority]}</Badge>
                      ) : (
                        <span className="text-xs text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="text-xs">{a.owner?.name ?? a.ownerText ?? <span className="text-neutral-400">—</span>}</td>
                    <td
                      className={`text-center tabular-nums ${a._count.actions === 0 ? (a.significant && !a.controls && !a.measure ? "font-semibold text-brand-red" : "text-neutral-300") : ""}`}
                      title={
                        a.significant && !a.controls && !a.measure && a._count.actions === 0
                          ? "Significant, zonder voorzieningen, maatregel of actie"
                          : undefined
                      }
                    >
                      {a._count.actions}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-neutral-500">
        {aspects.length} aspect{aspects.length === 1 ? "" : "en"} getoond. Grijs = locatie tijdelijk niet in werking. Rood bij open acties = significant zonder
        voorzieningen, maatregel of actie.
      </p>
    </>
  );
}
