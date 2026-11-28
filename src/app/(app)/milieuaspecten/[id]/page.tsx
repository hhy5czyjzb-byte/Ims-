import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { can } from "@/lib/rbac";
import { getLookups } from "@/lib/lookups";
import { getAspectLinkOptions, getAspectSuggestions } from "@/lib/legal-links";
import { formatDate, formatDateTime, isOverdue } from "@/lib/format";
import {
  ASPECT_RISK_LEVEL_APPROACH,
  ASPECT_RISK_LEVEL_CLASS,
  ASPECT_RISK_LEVEL_LABEL,
  aspectDisplayCode,
  aspectRisk,
  aspectRiskLevel,
  LIFECYCLE_PHASES,
  LIFECYCLE_SCORE_LABEL,
  PRIORITY_SIGNAL_LABEL,
  prioritySignal,
  describeSignificanceRule,
  determineAspectSignificance,
} from "@/lib/aspects";
import { getSignificanceRule } from "@/lib/aspect-settings";
import { riskDisplayCode } from "@/lib/risk";
import {
  ACTION_PRIORITY_LABEL,
  ACTION_STATUS_CLASS,
  ACTION_STATUS_LABEL,
  ASPECT_PRIORITY_CLASS,
  ASPECT_PRIORITY_LABEL,
  ASPECT_SITE_TYPE_LABEL,
  SITUATION_CLASS,
  SITUATION_LABEL,
  options,
} from "@/lib/labels";
import { Badge, Disclosure, Field, PageHeader, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { AspectForm } from "@/components/aspect-form";
import { AspectNav } from "@/components/aspect-nav";
import { LegalLinkItems, legalLinkSelect } from "@/components/legal-links";
import { createAspectAction, deleteAspect, updateAspect } from "../actions";

const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString("nl-NL", { maximumFractionDigits: 2 }));
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(String(v)));

export default async function AspectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const a = await prisma.environmentalAspect.findUnique({
    where: { id },
    include: {
      owner: true,
      createdBy: true,
      discipline: true,
      location: true,
      processes: { orderBy: { name: "asc" } },
      risks: { orderBy: [{ type: "asc" }, { externalRef: "asc" }, { number: "asc" }] },
      legalRequirements: { select: legalLinkSelect, orderBy: [{ externalRef: "asc" }, { number: "asc" }] },
      requirements: { include: { norm: true } },
      actions: { orderBy: { number: "desc" }, include: { owner: { select: { name: true } } } },
    },
  });
  if (!a) notFound();
  await logAudit({ user, action: "VIEW", entityType: "EnvironmentalAspect", entityId: id });

  const canEdit = can(user.role, "aspects.edit");
  const e = numOrNull(a.effectScore);
  const b = numOrNull(a.exposure);
  const w = numOrNull(a.probability);
  const risk = aspectRisk(e, b, w);
  const level = aspectRiskLevel(risk);
  const signal = prioritySignal({ priority: a.priority, risk, opportunity: a.opportunity });
  const rule = await getSignificanceRule();
  const sig = determineAspectSignificance(a, rule);
  const openActions = a.actions.filter((x) => x.status === "OPEN" || x.status === "IN_PROGRESS").length;
  const code = aspectDisplayCode(a);
  const [lookups, linkOptions, suggestions] = await Promise.all([
    getLookups(),
    canEdit ? getAspectLinkOptions() : Promise.resolve(null),
    canEdit ? getAspectSuggestions() : Promise.resolve(null),
  ]);
  const history = await prisma.auditLog.findMany({
    where: { entityType: "EnvironmentalAspect", entityId: id, action: { not: "VIEW" } },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { user: { select: { name: true } } },
  });

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/milieuaspecten", label: "Milieuaspecten" }]}
        title={`${code} ${a.aspect}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {a.priority ? (
              <Badge className={ASPECT_PRIORITY_CLASS[a.priority]}>Prio {ASPECT_PRIORITY_LABEL[a.priority].toLowerCase()}</Badge>
            ) : (
              <Badge className="bg-neutral-100 text-neutral-600">Nog geen prio</Badge>
            )}
            {a.significant ? (
              <Badge className="bg-brand-red text-white">Significant</Badge>
            ) : (
              <Badge className="bg-neutral-100 text-neutral-600">Niet significant</Badge>
            )}
            {level && <Badge className={ASPECT_RISK_LEVEL_CLASS[level]}>Risico {ASPECT_RISK_LEVEL_LABEL[level].toLowerCase()}</Badge>}
            <Badge className={a.opportunity ? "bg-green-100 text-green-800" : "bg-neutral-100 text-neutral-700"}>{a.opportunity ? "Kans" : "Bedreiging"}</Badge>
            {a.situation !== "NORMAL" && <Badge className={SITUATION_CLASS[a.situation]}>{SITUATION_LABEL[a.situation]}</Badge>}
            {a.co2Relevant && <Badge className="bg-sky-100 text-sky-800">CO2-relevant</Badge>}
            {!a.inOperation && <Badge className="bg-neutral-200 text-neutral-700">Locatie tijdelijk niet in werking</Badge>}
            {!a.active && <Badge className="bg-neutral-200 text-neutral-600">Niet actief</Badge>}
          </span>
        }
      />
      <AspectNav />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card text-sm lg:col-span-2">
          <div className="grid gap-4 md:grid-cols-3">
            <Info label="Activiteit">{a.activity}</Info>
            <Info label="Milieuaspect">{a.aspect}</Info>
            <Info label="Milieueffect">{a.impact}</Info>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Info label="Voorzieningen / beheersmaatregelen">{a.controls}</Info>
            <Info label="Maatregel / doelstelling">{a.measure}</Info>
          </div>
          <dl className="mt-5 grid grid-cols-[11rem_1fr] gap-y-1.5 border-t border-neutral-100 pt-4">
            <dt className="text-neutral-500">Bedrijfsonderdeel</dt>
            <dd>
              {a.businessUnit ?? "—"}
              {a.discipline && a.discipline.name !== a.businessUnit && <span className="text-neutral-500"> (BU {a.discipline.name})</span>}
            </dd>
            <dt className="text-neutral-500">Locatie</dt>
            <dd>
              {a.locationText ?? a.location?.name ?? "—"} · {ASPECT_SITE_TYPE_LABEL[a.siteType].toLowerCase()} ·{" "}
              {a.inOperation ? "in werking" : "tijdelijk niet in werking"}
            </dd>
            <dt className="text-neutral-500">Milieuthema</dt>
            <dd>{a.theme ?? "—"}</dd>
            <dt className="text-neutral-500">MBA (Bal)</dt>
            <dd>{a.mba ?? "—"}</dd>
            <dt className="text-neutral-500">Contextfactor</dt>
            <dd>{a.contextFactor ?? "—"}</dd>
            <dt className="text-neutral-500">Wettelijke eis</dt>
            <dd>
              {a.legalApplies ? "Ja" : "Nee"}
              {a.legalText && <span className="text-neutral-600"> — {a.legalText}</span>}
            </dd>
            <dt className="text-neutral-500">Stakeholders</dt>
            <dd>{a.stakeholders ?? "—"}</dd>
            <dt className="text-neutral-500">Klachten</dt>
            <dd>{a.complaints ? "Ja" : "Nee"}</dd>
            <dt className="text-neutral-500">Eigenaar</dt>
            <dd>{[a.ownerText, a.owner?.name].filter(Boolean).join(" · ") || <span className="text-brand-red">Geen eigenaar</span>}</dd>
            <dt className="text-neutral-500">Volgende beoordeling</dt>
            <dd className={a.active && isOverdue(a.reviewDate) ? "font-semibold text-brand-red" : ""}>{formatDate(a.reviewDate)}</dd>
            <dt className="text-neutral-500">Herkomst</dt>
            <dd>{a.origin ?? "—"}</dd>
          </dl>
        </section>

        <section className="card text-sm">
          <h2 className="mb-3">Beoordeling</h2>
          <div className="mb-3 grid grid-cols-4 gap-2 text-center">
            {(
              [
                ["E", e, "effect"],
                ["B", b, "voorkomen"],
                ["W", w, "waarsch."],
              ] as const
            ).map(([k, v, t]) => (
              <div key={k} className="rounded-md bg-neutral-50 p-2">
                <div className="text-xl font-bold">{fmt(v)}</div>
                <div className="text-xs text-neutral-500">
                  {k} · {t}
                </div>
              </div>
            ))}
            <div className={`rounded-md p-2 ${level ? ASPECT_RISK_LEVEL_CLASS[level] : "bg-neutral-50"}`}>
              <div className="text-xl font-bold">{fmt(risk)}</div>
              <div className="text-xs">risico</div>
            </div>
          </div>
          {level && (
            <p>
              <strong>{ASPECT_RISK_LEVEL_LABEL[level]}:</strong> {ASPECT_RISK_LEVEL_APPROACH[level]}
            </p>
          )}
          <p className="mt-2">
            <strong>Prio:</strong> {a.priority ? ASPECT_PRIORITY_LABEL[a.priority] : "nog niet bepaald"}
            {sig.significant && ` — significant (${sig.reasons.join(", ").toLowerCase()})`}
          </p>
          {signal && (
            <p className="mt-2 rounded-md bg-amber-50 p-2 text-amber-800">
              ⚠ {PRIORITY_SIGNAL_LABEL[signal]}.{" "}
              {a.priorityRationale ? <>Onderbouwing: {a.priorityRationale}</> : "Beoordeel of de prio klopt of leg vast waarom de afwijking terecht is."}
            </p>
          )}
          {!signal && a.priorityRationale && <p className="mt-2 text-neutral-600">Onderbouwing prio: {a.priorityRationale}</p>}
          <p className="mt-3 text-xs text-neutral-500">
            Risico = E × B × W. Niveaus: ≤ 20 laag, 21–70 middel, 71–200 hoog, &gt; 200 zeer hoog. Significant bij {describeSignificanceRule(rule)}.
          </p>

          <h3 className="mt-4 mb-1 font-semibold">Levenscyclusperspectief</h3>
          <table className="w-full text-xs">
            <tbody>
              {LIFECYCLE_PHASES.map((ph) => {
                const v = a[ph.key];
                return (
                  <tr key={ph.key} className="border-b border-neutral-100">
                    <td className="py-1 text-neutral-600">{ph.label}</td>
                    <td className={`py-1 text-right ${v === 3 ? "font-semibold text-brand-red" : ""}`}>
                      {v ? `${v} · ${LIFECYCLE_SCORE_LABEL[v]}` : "n.v.t."}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {a.lifecycleSource && <p className="mt-1 text-xs text-neutral-500">Bron: {a.lifecycleSource}</p>}
        </section>
      </div>

      <section className="card mt-4">
        <h2 className="mb-3">Acties</h2>
        {a.actions.length === 0 ? (
          <p className={`mb-3 text-sm ${a.significant && !a.controls ? "font-medium text-brand-red" : "text-neutral-500"}`}>
            {a.significant && !a.controls ? "Significant aspect zonder voorzieningen of actie." : "Geen acties."}
          </p>
        ) : (
          <table className="table mb-3">
            <tbody>
              {a.actions.map((x) => (
                <tr key={x.id}>
                  <td>
                    <Link href={`/acties/${x.id}`}>
                      #{x.number} {x.title}
                    </Link>
                  </td>
                  <td className="text-neutral-600">{x.owner?.name ?? "—"}</td>
                  <td
                    className={`whitespace-nowrap ${(x.status === "OPEN" || x.status === "IN_PROGRESS") && isOverdue(x.deadline) ? "font-semibold text-brand-red" : ""}`}
                  >
                    {formatDate(x.deadline)}
                  </td>
                  <td>
                    <Badge className={ACTION_STATUS_CLASS[x.status]}>{ACTION_STATUS_LABEL[x.status]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {can(user.role, "actions.create") && (
          <Form
            resetOnSuccess
            action={createAspectAction.bind(null, id)}
            className="grid gap-2 border-t border-neutral-100 pt-3 md:grid-cols-[1fr_12rem_10rem_8rem_auto] md:items-end"
          >
            <Field label={openActions ? "Nieuwe actie" : "Nieuwe actie / maatregel"}>
              <input name="title" required maxLength={300} className="input" placeholder="Wat moet er gebeuren?" />
            </Field>
            <Field label="Eigenaar">
              <Select name="ownerId" options={lookups.users} defaultValue={a.ownerId} placeholder="— Kies —" />
            </Field>
            <Field label="Deadline">
              <input name="deadline" type="date" className="input" />
            </Field>
            <Field label="Prioriteit">
              <Select name="priority" options={options(ACTION_PRIORITY_LABEL)} defaultValue={a.priority === "HIGH" ? "HIGH" : "MEDIUM"} />
            </Field>
            <SubmitButton variant="secondary">Actie toevoegen</SubmitButton>
          </Form>
        )}
      </section>

      <section className="card mt-4">
        <h2 className="mb-3">Koppelingen</h2>
        <div className="grid gap-4 text-sm md:grid-cols-2 lg:grid-cols-4">
          <LinkList title="Wet- en regelgeving">{a.legalRequirements.length ? [<LegalLinkItems key="l" items={a.legalRequirements} />] : []}</LinkList>
          <LinkList title="Processen">
            {a.processes.map((p) => (
              <li key={p.id}>
                <Link href={`/processen/${p.id}`}>{p.name}</Link>
              </li>
            ))}
          </LinkList>
          <LinkList title="Risico's en kansen">
            {a.risks.map((r) => (
              <li key={r.id}>
                <Link href={`/risicos/${r.id}`}>
                  {riskDisplayCode(r)} {r.title}
                </Link>
              </li>
            ))}
          </LinkList>
          <LinkList title="Normeisen">
            {a.requirements.map((r) => (
              <li key={r.id}>
                <Link href={`/normen/${r.normId}/eisen/${r.id}`}>
                  <Badge className="mr-1 bg-brand-grey-light text-neutral-900">{r.norm.code}</Badge>
                  {r.clause} {r.title}
                </Link>
              </li>
            ))}
          </LinkList>
        </div>
        {a.co2Relevant && (
          <p className="mt-3 text-xs text-neutral-500">
            CO2-relevant: het bijbehorende energieverbruik leg je vast in de <Link href="/co2/verbruik">CO2-module</Link>.
          </p>
        )}
      </section>

      {canEdit && linkOptions && suggestions && (
        <div className="mt-6">
          <Disclosure summary="Aspect wijzigen, beoordelen of koppelen">
            <AspectForm
              key={a.updatedAt.toISOString()}
              aspect={a}
              formAction={updateAspect.bind(null, id)}
              lookups={lookups}
              linkOptions={linkOptions}
              suggestions={suggestions!}
              rule={rule}
              submitLabel="Opslaan"
            />
            <Form action={deleteAspect.bind(null, id)} className="mt-4 border-t border-neutral-200 pt-3">
              <SubmitButton variant="link" confirm={`${code} definitief verwijderen? Overweeg liever 'Actief' uit te vinken.`}>
                Verwijderen
              </SubmitButton>
            </Form>
          </Disclosure>
        </div>
      )}

      <section className="card mt-6">
        <h2 className="mb-2">Historie</h2>
        {history.length === 0 ? (
          <p className="text-sm text-neutral-500">Geen wijzigingen.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {history.map((h) => (
              <li key={h.id}>
                <span className="text-neutral-500">{formatDateTime(h.createdAt)}</span> — {h.user?.name ?? h.userEmail ?? "Systeem"}: {h.summary}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Info({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">{label}</div>
      <div className="mt-0.5 whitespace-pre-line">{children || <span className="text-neutral-400">—</span>}</div>
    </div>
  );
}

function LinkList({ title, children }: { title: string; children: React.ReactNode[] }) {
  return (
    <div>
      <h3 className="mb-1 font-semibold">{title}</h3>
      {children.length ? <ul className="space-y-1">{children}</ul> : <p className="text-neutral-500">—</p>}
    </div>
  );
}
