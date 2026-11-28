import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { can, canAssessLegal } from "@/lib/rbac";
import { getLookups } from "@/lib/lookups";
import { getLegalLinkOptions } from "@/lib/legal-links";
import { formatDate, formatDateTime, isOverdue } from "@/lib/format";
import { legalDisplayCode } from "@/lib/compliance";
import { riskDisplayCode } from "@/lib/risk";
import { locationAuditCode } from "@/lib/location-audit";
import {
  ACTION_PRIORITY_LABEL,
  ACTION_STATUS_CLASS,
  ACTION_STATUS_LABEL,
  APPLICABILITY_LABEL,
  COMPLIANCE_STATUS_CLASS,
  COMPLIANCE_STATUS_LABEL,
  IMPACT_LEVEL_LABEL,
  IMPLEMENTATION_STATUS_CLASS,
  IMPLEMENTATION_STATUS_LABEL,
  LEGAL_CATEGORY_LABEL,
  options,
} from "@/lib/labels";
import { Badge, Disclosure, Field, PageHeader, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { LegalForm } from "@/components/legal-form";
import { AspectLinkItems, aspectLinkSelect } from "@/components/aspect-links";
import { AssessmentFields } from "@/components/assessment-fields";
import { createLegalAction, deleteLegal, recordAssessment, updateLegal } from "../actions";

export default async function LegalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const req = await prisma.legalRequirement.findUnique({
    where: { id },
    include: {
      norms: { orderBy: { sortOrder: "asc" } },
      owner: true,
      createdBy: true,
      discipline: true,
      location: true,
      processes: { orderBy: { name: "asc" } },
      documents: { orderBy: { title: "asc" } },
      risks: { orderBy: { number: "asc" } },
      requirements: { include: { norm: true } },
      actions: { orderBy: { number: "desc" }, include: { owner: { select: { name: true } } } },
      environmentalAspects: { select: aspectLinkSelect, orderBy: { number: "asc" } },
      assessments: { orderBy: [{ date: "desc" }, { createdAt: "desc" }], include: { assessedBy: { select: { name: true } } } },
    },
  });
  if (!req) notFound();
  await logAudit({ user, action: "VIEW", entityType: "LegalRequirement", entityId: id });

  const canEdit = can(user.role, "legal.edit");
  const canAssess = canAssessLegal(user, req);
  const code = legalDisplayCode(req);
  const openActions = req.actions.filter((a) => a.status === "OPEN" || a.status === "IN_PROGRESS").length;
  const late = req.active && req.status !== "NOT_APPLICABLE" && isOverdue(req.nextReviewDate);
  const [lookups, linkOptions] = await Promise.all([getLookups(), canEdit ? getLegalLinkOptions() : Promise.resolve(null)]);
  // Compliance-audit per vestiging: laatste oordeel per vestiging op vragen bij deze eis.
  const locationAnswers = await prisma.locationAuditAnswer.findMany({
    where: { legalRequirementId: id, audit: { status: { not: "CANCELLED" } } },
    orderBy: [{ audit: { date: "desc" } }, { audit: { number: "desc" } }],
    include: { audit: { select: { id: true, number: true, date: true, status: true, location: { select: { id: true, name: true } } } } },
  });
  const latestPerLocation = new Map<string, (typeof locationAnswers)[number][]>();
  const auditForLocation = new Map<string, string>();
  for (const a of locationAnswers) {
    const loc = a.audit.location.id;
    if (!auditForLocation.has(loc)) auditForLocation.set(loc, a.audit.id);
    if (auditForLocation.get(loc) !== a.audit.id) continue;
    latestPerLocation.set(loc, [...(latestPerLocation.get(loc) ?? []), a]);
  }
  const history = await prisma.auditLog.findMany({
    where: { entityType: "LegalRequirement", entityId: id, action: { not: "VIEW" } },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { user: { select: { name: true } } },
  });

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/wetgeving", label: "Wet- en regelgeving" }]}
        title={`${code} ${req.title}${req.article ? ` — ${req.article}` : ""}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge className={COMPLIANCE_STATUS_CLASS[req.status]}>{COMPLIANCE_STATUS_LABEL[req.status]}</Badge>
            <Badge>{req.theme ?? LEGAL_CATEGORY_LABEL[req.category]}</Badge>
            {req.applicability !== "YES" && <Badge className="bg-neutral-200 text-neutral-700">Van toepassing: {APPLICABILITY_LABEL[req.applicability]}</Badge>}
            {req.implementationStatus && (
              <Badge className={IMPLEMENTATION_STATUS_CLASS[req.implementationStatus]}>{IMPLEMENTATION_STATUS_LABEL[req.implementationStatus]}</Badge>
            )}
            {req.impact && <Badge>Impact {IMPACT_LEVEL_LABEL[req.impact].toLowerCase()}</Badge>}
            {req.norms.map((n) => (
              <Badge key={n.id} className="bg-brand-grey-light text-neutral-900">
                {n.code}
              </Badge>
            ))}
            {!req.active && <Badge className="bg-neutral-200 text-neutral-600">Vervallen</Badge>}
            {req.externalRef && <span className="text-xs text-neutral-500">Kenmerk bronregister: {req.externalRef}</span>}
          </span>
        }
        actions={
          req.sourceUrl && (
            <a href={req.sourceUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary">
              Wettekst ↗
            </a>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card text-sm lg:col-span-2">
          {req.subject && <div className="mb-1 text-xs font-semibold tracking-wide text-neutral-500 uppercase">{req.subject}</div>}
          <p className="whitespace-pre-line">{req.description || <span className="text-neutral-400">Geen omschrijving van de eis.</span>}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {req.evidence && (
              <div>
                <div className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Bewijslast</div>
                <p className="mt-0.5 whitespace-pre-line">{req.evidence}</p>
              </div>
            )}
            {req.nextStep && (
              <div>
                <div className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Volgende stap</div>
                <p className="mt-0.5 whitespace-pre-line">{req.nextStep}</p>
              </div>
            )}
          </div>
          {req.explanation && (
            <div className="mt-4 rounded-md bg-neutral-50 p-3">
              <div className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Toelichting bij de status</div>
              <p className="mt-0.5 whitespace-pre-line">{req.explanation}</p>
            </div>
          )}
        </section>
        <section className="card text-sm">
          <dl className="grid grid-cols-[8.5rem_1fr] gap-y-1.5">
            <dt className="text-neutral-500">Eigenaar</dt>
            <dd>
              {req.ownerText ?? (!req.owner && <span className="text-brand-red">Geen eigenaar</span>)}
              {req.owner && <span className={req.ownerText ? "ml-1 text-neutral-500" : ""}>{req.ownerText ? `(${req.owner.name})` : req.owner.name}</span>}
            </dd>
            {req.regulationType && (
              <>
                <dt className="text-neutral-500">Soort</dt>
                <dd>{req.regulationType}</dd>
              </>
            )}
            {req.origin && (
              <>
                <dt className="text-neutral-500">Herkomst</dt>
                <dd>{req.origin}</dd>
              </>
            )}
            <dt className="text-neutral-500">Discipline</dt>
            <dd>{req.discipline?.name ?? "Bedrijfsbreed"}</dd>
            <dt className="text-neutral-500">Locatie</dt>
            <dd>{req.location?.name ?? "Alle locaties"}</dd>
            <dt className="text-neutral-500">Bevoegd gezag</dt>
            <dd>{req.source ?? "—"}</dd>
            <dt className="text-neutral-500">Laatst getoetst</dt>
            <dd>{formatDate(req.lastReviewDate)}</dd>
            <dt className="text-neutral-500">Volgende toetsing</dt>
            <dd className={late ? "font-semibold text-brand-red" : ""}>
              {formatDate(req.nextReviewDate)}
              {late && " — verlopen"}
            </dd>
            <dt className="text-neutral-500">Toetsfrequentie</dt>
            <dd>elke {req.reviewIntervalMonths} maanden</dd>
          </dl>
        </section>
      </div>

      {canAssess && req.active && (
        <section className="card mt-4 border-brand-red/30">
          <h2 className="mb-3">Toetsing vastleggen</h2>
          <Form resetOnSuccess key={req.updatedAt.toISOString()} action={recordAssessment.bind(null, id)} className="grid gap-3 md:grid-cols-4">
            <AssessmentFields
              title={`${req.title}${req.article ? ` ${req.article}` : ""}`}
              intervalMonths={req.reviewIntervalMonths}
              defaultOwnerId={req.ownerId}
              users={lookups.users}
              openActions={openActions}
              canCreateActions={can(user.role, "actions.create")}
            />
            <div className="md:col-span-4">
              <SubmitButton>Toetsing opslaan</SubmitButton>
            </div>
          </Form>
        </section>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3">Toetsingen (evaluatie van de naleving)</h2>
          {req.assessments.length === 0 ? (
            <p className="text-sm text-neutral-500">Nog geen toetsingen vastgelegd.</p>
          ) : (
            <table className="table">
              <tbody>
                {req.assessments.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap">{formatDate(a.date)}</td>
                    <td>
                      <Badge className={COMPLIANCE_STATUS_CLASS[a.status]}>{COMPLIANCE_STATUS_LABEL[a.status]}</Badge>
                    </td>
                    <td className="text-sm">
                      {a.explanation && <div className="whitespace-pre-line">{a.explanation}</div>}
                      <div className="text-xs text-neutral-500">{a.assessedBy?.name ?? "—"}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card">
          <h2 className="mb-3">Acties</h2>
          {req.actions.length === 0 ? (
            <p className={`mb-3 text-sm ${req.status === "NON_COMPLIANT" ? "font-medium text-brand-red" : "text-neutral-500"}`}>
              {req.status === "NON_COMPLIANT" ? "Voldoet niet, maar er is nog geen actie." : "Geen acties."}
            </p>
          ) : (
            <table className="table mb-3">
              <tbody>
                {req.actions.map((a) => (
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
            <Disclosure summary="Actie toevoegen">
              <Form resetOnSuccess action={createLegalAction.bind(null, id)} className="grid gap-2 md:grid-cols-2">
                <Field label="Actie" className="md:col-span-2">
                  <input name="title" required maxLength={300} className="input" />
                </Field>
                <Field label="Eigenaar">
                  <Select name="ownerId" options={lookups.users} defaultValue={req.ownerId} placeholder="— Kies —" />
                </Field>
                <Field label="Deadline">
                  <input name="deadline" type="date" className="input" />
                </Field>
                <Field label="Prioriteit">
                  <Select name="priority" options={options(ACTION_PRIORITY_LABEL)} defaultValue="MEDIUM" />
                </Field>
                <div className="self-end">
                  <SubmitButton variant="secondary">Toevoegen</SubmitButton>
                </div>
              </Form>
            </Disclosure>
          )}
        </section>
      </div>

      {latestPerLocation.size > 0 && (
        <section className="card mt-4">
          <h2 className="mb-1">Per vestiging (compliance-audit)</h2>
          <p className="mb-3 text-sm text-neutral-600">Laatste oordeel per vestiging. Neem de uitkomst mee in de toetsing van deze eis.</p>
          <table className="table">
            <thead>
              <tr>
                <th>Vestiging</th>
                <th>Audit</th>
                <th>Auditvraag</th>
                <th>Oordeel</th>
                <th>Bevinding</th>
              </tr>
            </thead>
            <tbody>
              {[...latestPerLocation.values()].flatMap((answers) =>
                answers.map((a) => (
                  <tr key={a.id}>
                    <td>{a.audit.location.name}</td>
                    <td className="whitespace-nowrap">
                      <Link href={`/wetgeving/vestigingen/${a.audit.id}`}>
                        {locationAuditCode(a.audit.number)} · {formatDate(a.audit.date)}
                      </Link>
                    </td>
                    <td className="text-xs">{a.questionText}</td>
                    <td>
                      <Badge className={COMPLIANCE_STATUS_CLASS[a.verdict]}>
                        {a.verdict === "NOT_ASSESSED" ? "Nog niet beoordeeld" : COMPLIANCE_STATUS_LABEL[a.verdict]}
                      </Badge>
                    </td>
                    <td className="text-xs whitespace-pre-line">{a.finding ?? "—"}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </section>
      )}

      <section className="card mt-4">
        <h2 className="mb-3">Koppelingen</h2>
        <div className="grid gap-4 text-sm md:grid-cols-2 lg:grid-cols-5">
          <LinkList title="Milieuaspecten">
            {req.environmentalAspects.length ? [<AspectLinkItems key="a" items={req.environmentalAspects} moreHref={`/milieuaspecten?wet=${id}`} />] : []}
          </LinkList>
          <LinkList title="Normeisen">
            {req.requirements.map((r) => (
              <li key={r.id}>
                <Link href={`/normen/${r.normId}/eisen/${r.id}`}>
                  <Badge className="mr-1 bg-brand-grey-light text-neutral-900">{r.norm.code}</Badge>
                  {r.clause} {r.title}
                </Link>
              </li>
            ))}
          </LinkList>
          <LinkList title="Processen">
            {req.processes.map((p) => (
              <li key={p.id}>
                <Link href={`/processen/${p.id}`}>{p.name}</Link>
              </li>
            ))}
          </LinkList>
          <LinkList title="Documenten">
            {req.documents.map((d) => (
              <li key={d.id}>
                <Link href={`/documenten/${d.id}`}>{d.title}</Link>
              </li>
            ))}
          </LinkList>
          <LinkList title="Risico's en kansen">
            {req.risks.map((r) => (
              <li key={r.id}>
                <Link href={`/risicos/${r.id}`}>
                  {riskDisplayCode(r)} {r.title}
                </Link>
              </li>
            ))}
          </LinkList>
        </div>
        <p className="mt-3 text-xs text-neutral-400">Koppeling aan vergunningen volgt met het certificaten- en vergunningenarchief.</p>
      </section>

      {canEdit && linkOptions && (
        <div className="mt-6">
          <Disclosure summary="Eis wijzigen of koppelen">
            <LegalForm
              key={req.updatedAt.toISOString()}
              req={req}
              formAction={updateLegal.bind(null, id)}
              lookups={lookups}
              linkOptions={linkOptions}
              submitLabel="Opslaan"
            />
            <Form action={deleteLegal.bind(null, id)} className="mt-4 border-t border-neutral-200 pt-3">
              <SubmitButton
                variant="link"
                confirm={`${code} definitief verwijderen, inclusief alle toetsingen? Overweeg liever 'Actief' uit te vinken (dan blijft de historie bewaard).`}
              >
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

function LinkList({ title, children }: { title: string; children: React.ReactNode[] }) {
  return (
    <div>
      <h3 className="mb-1 font-semibold">{title}</h3>
      {children.length ? <ul className="space-y-1">{children}</ul> : <p className="text-neutral-500">—</p>}
    </div>
  );
}
