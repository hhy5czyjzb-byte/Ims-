import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { can } from "@/lib/rbac";
import { getLookups } from "@/lib/lookups";
import { getAspectLinkOptions } from "@/lib/legal-links";
import { getSignificanceThreshold } from "@/lib/settings";
import { formatDate, formatDateTime, isOverdue } from "@/lib/format";
import { aspectCode, determineSignificance } from "@/lib/aspects";
import { riskDisplayCode } from "@/lib/risk";
import { ACTION_PRIORITY_LABEL, ACTION_STATUS_CLASS, ACTION_STATUS_LABEL, ASPECT_TYPE_LABEL, SITUATION_CLASS, SITUATION_LABEL, options } from "@/lib/labels";
import { Badge, Disclosure, Field, PageHeader, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { AspectForm } from "@/components/aspect-form";
import { LegalLinkItems, legalLinkSelect } from "@/components/legal-links";
import { createAspectAction, deleteAspect, updateAspect } from "../actions";

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
      risks: { orderBy: { number: "asc" } },
      legalRequirements: { select: legalLinkSelect, orderBy: [{ externalRef: "asc" }, { number: "asc" }] },
      requirements: { include: { norm: true } },
      actions: { orderBy: { number: "desc" }, include: { owner: { select: { name: true } } } },
    },
  });
  if (!a) notFound();
  await logAudit({ user, action: "VIEW", entityType: "EnvironmentalAspect", entityId: id });

  const canEdit = can(user.role, "aspects.edit");
  const threshold = await getSignificanceThreshold();
  const sig = determineSignificance({
    score: a.score,
    threshold,
    legalApplies: a.legalApplies || a.legalRequirements.length > 0,
    stakeholderConcern: a.stakeholderConcern,
    manual: a.significanceManual ? { significant: a.significant, reason: a.significanceReason } : null,
  });
  const openActions = a.actions.filter((x) => x.status === "OPEN" || x.status === "IN_PROGRESS").length;
  const code = aspectCode(a.number);
  const [lookups, linkOptions] = await Promise.all([getLookups(), canEdit ? getAspectLinkOptions() : Promise.resolve(null)]);
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
            {a.significant ? (
              <Badge className="bg-brand-red text-white">Significant</Badge>
            ) : (
              <Badge className="bg-neutral-100 text-neutral-600">Niet significant</Badge>
            )}
            <Badge className={SITUATION_CLASS[a.situation]}>{SITUATION_LABEL[a.situation]}</Badge>
            <Badge>{ASPECT_TYPE_LABEL[a.aspectType]}</Badge>
            {a.co2Relevant && <Badge className="bg-sky-100 text-sky-800">CO2-relevant</Badge>}
            {!a.active && <Badge className="bg-neutral-200 text-neutral-600">Niet actief</Badge>}
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card text-sm lg:col-span-2">
          <div className="grid gap-4 md:grid-cols-3">
            <Info label="Activiteit">{a.activity}</Info>
            <Info label="Milieuaspect">{a.aspect}</Info>
            <Info label="Milieueffect">{a.impact}</Info>
          </div>
          <div className="mt-4">
            <Info label="Beheersmaatregelen">{a.controls}</Info>
          </div>
          <dl className="mt-5 grid grid-cols-[9rem_1fr] gap-y-1.5 border-t border-neutral-100 pt-4">
            <dt className="text-neutral-500">Eigenaar</dt>
            <dd>{a.owner?.name ?? <span className="text-brand-red">Geen eigenaar</span>}</dd>
            <dt className="text-neutral-500">Discipline</dt>
            <dd>{a.discipline?.name ?? "Bedrijfsbreed"}</dd>
            <dt className="text-neutral-500">Locatie</dt>
            <dd>{a.location?.name ?? "Alle locaties"}</dd>
            <dt className="text-neutral-500">Volgende beoordeling</dt>
            <dd className={a.active && isOverdue(a.reviewDate) ? "font-semibold text-brand-red" : ""}>{formatDate(a.reviewDate)}</dd>
            {a.externalRef && (
              <>
                <dt className="text-neutral-500">Kenmerk bronregister</dt>
                <dd>{a.externalRef}</dd>
              </>
            )}
          </dl>
        </section>

        <section className="card text-sm">
          <h2 className="mb-3">Significantie</h2>
          <div className="mb-3 grid grid-cols-4 gap-2 text-center">
            {(
              [
                ["F", a.frequency],
                ["E", a.severity],
                ["O", a.extent],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="rounded-md bg-neutral-50 p-2">
                <div className="text-xl font-bold">{v ?? "—"}</div>
                <div className="text-xs text-neutral-500">{k}</div>
              </div>
            ))}
            <div className={`rounded-md p-2 ${a.significant ? "bg-red-50" : "bg-neutral-50"}`}>
              <div className={`text-xl font-bold ${a.significant ? "text-brand-red" : ""}`}>{a.score ?? "—"}</div>
              <div className="text-xs text-neutral-500">score</div>
            </div>
          </div>
          <ul className="list-inside list-disc space-y-0.5">
            {sig.reasons.length ? sig.reasons.map((r) => <li key={r}>{r}</li>) : <li className="text-neutral-500">Geen criterium van toepassing</li>}
          </ul>
          <p className="mt-3 text-xs text-neutral-500">F = frequentie/kans, E = ernst, O = omvang (elk 1–5). Significant vanaf score {threshold}.</p>
          {sig.significant !== a.significant && (
            <p className="mt-2 text-xs text-amber-700">
              Let op: de koppelingen zijn gewijzigd sinds de laatste beoordeling. Sla het aspect opnieuw op om de significantie bij te werken.
            </p>
          )}
        </section>
      </div>

      <section className="card mt-4">
        <h2 className="mb-3">Acties</h2>
        {a.actions.length === 0 ? (
          <p className={`mb-3 text-sm ${a.significant && !a.controls ? "font-medium text-brand-red" : "text-neutral-500"}`}>
            {a.significant && !a.controls ? "Significant aspect zonder beheersmaatregelen of actie." : "Geen acties."}
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
              <Select name="priority" options={options(ACTION_PRIORITY_LABEL)} defaultValue={a.significant ? "HIGH" : "MEDIUM"} />
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

      {canEdit && linkOptions && (
        <div className="mt-6">
          <Disclosure summary="Aspect wijzigen, scoren of koppelen">
            <AspectForm
              key={a.updatedAt.toISOString()}
              aspect={a}
              formAction={updateAspect.bind(null, id)}
              lookups={lookups}
              linkOptions={linkOptions}
              threshold={threshold}
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
