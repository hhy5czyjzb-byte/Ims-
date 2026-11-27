import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { can, canEditRisk } from "@/lib/rbac";
import { getLookups, getRequirementOptions } from "@/lib/lookups";
import { formatDate, formatDateTime, isOverdue } from "@/lib/format";
import {
  ACTION_PRIORITY_LABEL,
  ACTION_STATUS_CLASS,
  ACTION_STATUS_LABEL,
  RISK_CATEGORY_LABEL,
  RISK_STATUS_CLASS,
  RISK_STATUS_LABEL,
  RISK_TYPE_LABEL,
  TREATMENT_STATUS_CLASS,
  TREATMENT_STATUS_LABEL,
  options,
} from "@/lib/labels";
import { IMPACT_LABEL, LIKELIHOOD_LABEL, PRIORITY_LABEL, RISK_LEVEL_APPROACH, RISK_LEVEL_LABEL, riskDisplayCode, riskLevel, riskPriority } from "@/lib/risk";
import { Badge, Disclosure, Field, PageHeader, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { RiskMatrix, ScoreBadge } from "@/components/risk-matrix";
import { RiskForm } from "@/components/risk-form";
import { LegalLinkItems, legalLinkSelect } from "@/components/legal-links";
import { AspectLinkItems, aspectLinkSelect } from "@/components/aspect-links";
import { createRiskAction, deleteRisk, updateRisk } from "../actions";

export default async function RiskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const risk = await prisma.risk.findUnique({
    where: { id },
    include: {
      owner: true,
      createdBy: true,
      disciplines: { orderBy: { sortOrder: "asc" } },
      location: true,
      processes: { orderBy: { name: "asc" } },
      requirements: { include: { norm: true } },
      legalRequirements: { select: legalLinkSelect, orderBy: [{ externalRef: "asc" }, { number: "asc" }] },
      environmentalAspects: { select: aspectLinkSelect, orderBy: { number: "asc" } },
      actions: { orderBy: { number: "desc" }, include: { owner: { select: { name: true } } } },
    },
  });
  if (!risk) notFound();
  await logAudit({ user, action: "VIEW", entityType: "Risk", entityId: id });

  const editable = canEditRisk(user, risk);
  const code = riskDisplayCode(risk);
  const assessedAfter = risk.likelihoodAfter != null && risk.impactAfter != null;

  const markers: Record<string, string[]> = {};
  const add = (k: string, m: string) => (markers[k] = [...(markers[k] ?? []), m]);
  add(`${risk.likelihoodBefore}-${risk.impactBefore}`, "B");
  if (assessedAfter) add(`${risk.likelihoodAfter}-${risk.impactAfter}`, "N");

  const [lookups, requirementGroups, processes] = await Promise.all([
    getLookups(),
    editable ? getRequirementOptions() : Promise.resolve([]),
    editable ? prisma.process.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const history = await prisma.auditLog.findMany({
    where: { entityType: "Risk", entityId: id, action: { not: "VIEW" } },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { user: { select: { name: true } } },
  });
  const reviewOverdue = risk.status !== "CLOSED" && isOverdue(risk.reviewDate);

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/risicos", label: "Risico's en kansen" }]}
        title={`${code} ${risk.title}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge className={risk.type === "RISK" ? "bg-red-50 text-brand-red-dark" : "bg-green-50 text-green-800"}>{RISK_TYPE_LABEL[risk.type]}</Badge>
            <Badge>{RISK_CATEGORY_LABEL[risk.category]}</Badge>
            <Badge className={risk.strategic ? "bg-red-100 text-brand-red-dark" : "bg-neutral-100 text-neutral-700"}>
              {PRIORITY_LABEL[riskPriority(risk)]}
            </Badge>
            <Badge className={TREATMENT_STATUS_CLASS[risk.treatmentStatus]}>Aanpak: {TREATMENT_STATUS_LABEL[risk.treatmentStatus]}</Badge>
            <Badge className={RISK_STATUS_CLASS[risk.status]}>{RISK_STATUS_LABEL[risk.status]}</Badge>
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card text-sm lg:col-span-2">
          {risk.description && <p className="mb-4 whitespace-pre-line">{risk.description}</p>}
          <div className="grid gap-4 md:grid-cols-2">
            <Info label={risk.type === "OPPORTUNITY" ? "Aanleiding" : "Oorzaak / context"}>{risk.cause}</Info>
            <Info label={risk.type === "OPPORTUNITY" ? "Opbrengst" : "Gevolg"}>{risk.consequence}</Info>
            <Info label={risk.type === "OPPORTUNITY" ? "Actie om te benutten" : "Beheersmaatregel"} className="md:col-span-2">
              {risk.measures}
            </Info>
            <Info label="Monitoring / KPI">{risk.monitoring}</Info>
            <Info label="Kader">{risk.framework}</Info>
            {risk.notes && (
              <Info label="Opmerking" className="md:col-span-2">
                {risk.notes}
              </Info>
            )}
          </div>
          <dl className="mt-5 grid grid-cols-[9rem_1fr] gap-y-1.5 border-t border-neutral-100 pt-4">
            <dt className="text-neutral-500">Eigenaar</dt>
            <dd>
              {risk.ownerText ?? (!risk.owner && <span className="text-brand-red">Geen eigenaar</span>)}
              {risk.owner && <span className={risk.ownerText ? "ml-1 text-neutral-500" : ""}>{risk.ownerText ? `(${risk.owner.name})` : risk.owner.name}</span>}
            </dd>
            <dt className="text-neutral-500">Termijn</dt>
            <dd>{risk.term ?? "—"}</dd>
            <dt className="text-neutral-500">BU</dt>
            <dd>{risk.disciplines.length ? risk.disciplines.map((d) => d.name).join(", ") : "Groep (bedrijfsbreed)"}</dd>
            <dt className="text-neutral-500">Herkomst</dt>
            <dd>{[risk.origin, risk.contextFactor, risk.theme].filter(Boolean).join(" · ") || "—"}</dd>
            <dt className="text-neutral-500">Locatie</dt>
            <dd>{risk.location?.name ?? "Alle locaties"}</dd>
            <dt className="text-neutral-500">Laatst beoordeeld</dt>
            <dd>{formatDate(risk.lastReviewedAt)}</dd>
            <dt className="text-neutral-500">Volgende beoordeling</dt>
            <dd className={reviewOverdue ? "font-semibold text-brand-red" : ""}>
              {formatDate(risk.reviewDate)}
              {reviewOverdue && " — verlopen"}
            </dd>
            <dt className="text-neutral-500">Vastgelegd</dt>
            <dd>
              {formatDate(risk.createdAt)}
              {risk.createdBy && ` door ${risk.createdBy.name}`}
            </dd>
          </dl>
        </section>

        <section className="card">
          <h2 className="mb-3">Beoordeling</h2>
          <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
            <Assessment label="Vóór maatregelen" type={risk.type} likelihood={risk.likelihoodBefore} impact={risk.impactBefore} />
            {assessedAfter ? (
              <Assessment label="Na maatregelen" type={risk.type} likelihood={risk.likelihoodAfter!} impact={risk.impactAfter!} />
            ) : (
              <div>
                <div className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Na maatregelen</div>
                <p className="mt-1 text-neutral-500">Nog niet beoordeeld</p>
              </div>
            )}
          </div>
          <RiskMatrix type={risk.type} markers={markers} size="sm" />
          <p className="mt-2 text-xs text-neutral-500">B = vóór maatregelen (bruto), N = na maatregelen (rest).</p>
          <p className="mt-2 rounded-md bg-neutral-50 p-2 text-xs text-neutral-600">
            <strong>{RISK_LEVEL_LABEL[riskLevel(risk.likelihoodBefore * risk.impactBefore)]}:</strong>{" "}
            {RISK_LEVEL_APPROACH[riskLevel(risk.likelihoodBefore * risk.impactBefore)][risk.type === "RISK" ? "risk" : "opportunity"]}
          </p>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card text-sm">
          <h2 className="mb-2">Processen</h2>
          {risk.processes.length === 0 ? (
            <p className="text-neutral-500">Niet aan een proces gekoppeld.</p>
          ) : (
            <ul className="space-y-1">
              {risk.processes.map((p) => (
                <li key={p.id}>
                  <Link href={`/processen/${p.id}`}>{p.name}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card text-sm">
          <h2 className="mb-2">Normeisen</h2>
          {risk.requirements.length === 0 ? (
            <p className="text-neutral-500">Niet aan normeisen gekoppeld.</p>
          ) : (
            <ul className="space-y-1">
              {risk.requirements.map((r) => (
                <li key={r.id}>
                  <Link href={`/normen/${r.normId}/eisen/${r.id}`}>
                    <Badge className="mr-1 bg-brand-grey-light text-neutral-900">{r.norm.code}</Badge>
                    {r.clause} {r.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        {risk.legalRequirements.length > 0 && (
          <section className="card text-sm lg:col-span-2">
            <h2 className="mb-2">Wet- en regelgeving</h2>
            <ul className="space-y-1">
              <LegalLinkItems items={risk.legalRequirements} />
            </ul>
          </section>
        )}
        {risk.environmentalAspects.length > 0 && (
          <section className="card text-sm lg:col-span-2">
            <h2 className="mb-2">Milieuaspecten</h2>
            <ul className="space-y-1">
              <AspectLinkItems items={risk.environmentalAspects} />
            </ul>
          </section>
        )}
      </div>

      <section className="card mt-4">
        <h2 className="mb-3">Acties</h2>
        {risk.actions.length === 0 ? (
          <p className="mb-3 text-sm text-neutral-500">Nog geen acties bij {risk.type === "RISK" ? "dit risico" : "deze kans"}.</p>
        ) : (
          <table className="table mb-4">
            <tbody>
              {risk.actions.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link href={`/acties/${a.id}`}>
                      #{a.number} {a.title}
                    </Link>
                  </td>
                  <td className="text-neutral-600">{a.owner?.name ?? "—"}</td>
                  <td
                    className={`whitespace-nowrap ${(a.status === "OPEN" || a.status === "IN_PROGRESS") && isOverdue(a.deadline) ? "font-semibold text-brand-red" : ""}`}
                  >
                    {formatDate(a.deadline)}
                  </td>
                  <td>
                    <Badge className={ACTION_STATUS_CLASS[a.status]}>{ACTION_STATUS_LABEL[a.status]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {can(user.role, "actions.create") && (
          <Form
            resetOnSuccess
            action={createRiskAction.bind(null, id)}
            className="grid gap-2 border-t border-neutral-100 pt-3 md:grid-cols-[1fr_12rem_10rem_8rem_auto] md:items-end"
          >
            <Field label="Nieuwe actie / maatregel">
              <input name="title" required maxLength={300} className="input" placeholder="Wat moet er gebeuren?" />
            </Field>
            <Field label="Eigenaar">
              <Select name="ownerId" options={lookups.users} defaultValue={risk.ownerId} placeholder="— Kies —" />
            </Field>
            <Field label="Deadline">
              <input name="deadline" type="date" className="input" />
            </Field>
            <Field label="Prioriteit">
              <Select
                name="priority"
                options={options(ACTION_PRIORITY_LABEL)}
                defaultValue={riskLevel(risk.likelihoodBefore * risk.impactBefore) === "high" ? "HIGH" : "MEDIUM"}
              />
            </Field>
            <SubmitButton variant="secondary">Actie toevoegen</SubmitButton>
          </Form>
        )}
      </section>

      {editable && (
        <div className="mt-6">
          <Disclosure summary="Risico wijzigen of herbeoordelen">
            <RiskForm
              key={risk.updatedAt.toISOString()}
              risk={risk}
              formAction={updateRisk.bind(null, id)}
              lookups={lookups}
              processOptions={processes.map((p) => ({ value: p.id, label: p.name }))}
              requirementGroups={requirementGroups}
              submitLabel="Opslaan"
            />
            {can(user.role, "risks.editAny") && (
              <Form action={deleteRisk.bind(null, id)} className="mt-4 border-t border-neutral-200 pt-3">
                <SubmitButton
                  variant="link"
                  confirm={`${code} definitief verwijderen? Overweeg liever de status 'Afgesloten'. Gekoppelde acties blijven bestaan.`}
                >
                  Verwijderen
                </SubmitButton>
              </Form>
            )}
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

function Assessment({ label, type, likelihood, impact }: { label: string; type: "RISK" | "OPPORTUNITY"; likelihood: number; impact: number }) {
  const score = likelihood * impact;
  return (
    <div>
      <div className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <ScoreBadge likelihood={likelihood} impact={impact} type={type} />
        <span className="font-medium">{RISK_LEVEL_LABEL[riskLevel(score)]}</span>
      </div>
      <div className="mt-0.5 text-xs text-neutral-500">
        Kans {likelihood} ({LIKELIHOOD_LABEL[likelihood].toLowerCase()}) × effect {impact} ({IMPACT_LABEL[type][impact].toLowerCase()})
      </div>
    </div>
  );
}
