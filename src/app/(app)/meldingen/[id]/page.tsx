import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { can, canEditReport } from "@/lib/rbac";
import { getLookups, getRequirementOptions } from "@/lib/lookups";
import { formatDate, formatDateTime, isOverdue } from "@/lib/format";
import { groupOfType, NEEDS_ANALYSIS, reportCloseProblems, reportDisplayCode, reportGroup, SAFETY_TYPES } from "@/lib/reports";
import {
  ACTION_KIND_LABEL,
  ACTION_PRIORITY_LABEL,
  ACTION_STATUS_CLASS,
  ACTION_STATUS_LABEL,
  INJURY_LEVEL_LABEL,
  ABSENCE_CLASS,
  ABSENCE_LABEL,
  REPORT_ORIGIN_LABEL,
  REPORT_SEVERITY_CLASS,
  REPORT_SEVERITY_LABEL,
  REPORT_STATUS_CLASS,
  REPORT_STATUS_LABEL,
  REPORT_TYPE_CLASS,
  REPORT_TYPE_LABEL,
  options,
} from "@/lib/labels";
import { Badge, Disclosure, Field, PageHeader, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { ReportForm } from "@/components/report-form";
import { createReportAction, deleteReport, setReportStatus, updateReport } from "../actions";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const r = await prisma.report.findUnique({
    where: { id },
    include: {
      reportedBy: { select: { name: true } },
      owner: { select: { name: true } },
      location: { select: { name: true } },
      discipline: { select: { name: true } },
      process: { select: { id: true, name: true } },
      requirements: { include: { norm: true } },
      actions: { orderBy: { number: "asc" }, include: { owner: { select: { name: true } } } },
    },
  });
  if (!r) notFound();
  await logAudit({ user, action: "VIEW", entityType: "Report", entityId: id });

  const editable = canEditReport(user, r);
  const manage = can(user.role, "reports.manage");
  const code = reportDisplayCode(r);
  const problems = reportCloseProblems(r);
  const safety = SAFETY_TYPES.includes(r.type);
  const [lookups, processes, requirementGroups] = editable
    ? await Promise.all([
        getLookups(),
        prisma.process.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        getRequirementOptions(),
      ])
    : [null, [], []];
  const history = await prisma.auditLog.findMany({
    where: { entityType: "Report", entityId: id, action: { not: "VIEW" } },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { user: { select: { name: true } } },
  });

  const Info = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <div className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">{label}</div>
      <div className="mt-0.5 whitespace-pre-line">{children || <span className="text-neutral-400">—</span>}</div>
    </div>
  );

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: `/meldingen?groep=${groupOfType(r.type)}`, label: `Meldingen · ${reportGroup(groupOfType(r.type)).label}` }]}
        title={`${code} ${r.title}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge className={REPORT_TYPE_CLASS[r.type]}>{REPORT_TYPE_LABEL[r.type]}</Badge>
            <Badge className={REPORT_STATUS_CLASS[r.status]}>{REPORT_STATUS_LABEL[r.status]}</Badge>
            {r.severity && <Badge className={REPORT_SEVERITY_CLASS[r.severity]}>Ernst {REPORT_SEVERITY_LABEL[r.severity].toLowerCase()}</Badge>}
            {r.reportable && <Badge className="bg-brand-red text-white">Meldplichtig</Badge>}
            <span>· {formatDate(r.occurredAt)}</span>
          </span>
        }
        actions={
          manage && (
            <>
              {r.status === "NEW" && (
                <Form action={setReportStatus.bind(null, id)}>
                  <input type="hidden" name="status" value="IN_PROGRESS" />
                  <SubmitButton variant="secondary">In behandeling nemen</SubmitButton>
                </Form>
              )}
              {(r.status === "CLOSED" || r.status === "REJECTED") && (
                <Form action={setReportStatus.bind(null, id)}>
                  <input type="hidden" name="status" value="IN_PROGRESS" />
                  <SubmitButton variant="secondary">Heropenen</SubmitButton>
                </Form>
              )}
            </>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card text-sm lg:col-span-2">
          <div className="grid gap-4 md:grid-cols-2">
            <Info label="Wat is er gebeurd">{r.description ?? r.title}</Info>
            <Info label="Directe maatregel / correctie">{r.immediateAction}</Info>
          </div>
          <dl className="mt-5 grid grid-cols-[10rem_1fr] gap-y-1.5 border-t border-neutral-100 pt-4">
            <dt className="text-neutral-500">Herkomst</dt>
            <dd>{REPORT_ORIGIN_LABEL[r.origin]}</dd>
            <dt className="text-neutral-500">Waar</dt>
            <dd>{[r.discipline?.name, r.location?.name, r.locationText].filter(Boolean).join(" · ") || "—"}</dd>
            {r.process && (
              <>
                <dt className="text-neutral-500">Proces</dt>
                <dd>
                  <Link href={`/processen/${r.process.id}`}>{r.process.name}</Link>
                </dd>
              </>
            )}
            {(safety || r.injury || r.absence) && (
              <>
                {r.accidentCategory && (
                  <>
                    <dt className="text-neutral-500">Categorie ongeval</dt>
                    <dd>{r.accidentCategory}</dd>
                  </>
                )}
                <dt className="text-neutral-500">Verzuim</dt>
                <dd>{r.absence ? <Badge className={ABSENCE_CLASS[r.absence]}>{ABSENCE_LABEL[r.absence]}</Badge> : "Geen / onbekend"}</dd>
                <dt className="text-neutral-500">Letsel</dt>
                <dd>
                  {r.injury ? INJURY_LEVEL_LABEL[r.injury] : "—"}
                  {r.lostDays ? ` · ${r.lostDays} verzuimdag(en)` : ""}
                </dd>
                <dt className="text-neutral-500">Meldplichtig</dt>
                <dd>{r.reportable ? `Ja${r.reportedToAuthorityAt ? `, gemeld op ${formatDate(r.reportedToAuthorityAt)}` : " — nog niet gemeld"}` : "Nee"}</dd>
              </>
            )}
            <dt className="text-neutral-500">Gemeld door</dt>
            <dd>
              {[r.reporterText, r.reportedBy?.name].filter(Boolean).join(" · ") || "—"} op {formatDateTime(r.createdAt)}
            </dd>
            <dt className="text-neutral-500">Behandelaar</dt>
            <dd>{r.owner?.name ?? r.ownerText ?? <span className="text-neutral-400">nog niet toegewezen</span>}</dd>
            {r.costs && (
              <>
                <dt className="text-neutral-500">Faalkosten</dt>
                <dd>€ {Number(r.costs).toLocaleString("nl-NL", { minimumFractionDigits: 2 })}</dd>
              </>
            )}
            {r.requirements.length > 0 && (
              <>
                <dt className="text-neutral-500">Normeisen</dt>
                <dd className="flex flex-wrap gap-1">
                  {r.requirements.map((q) => (
                    <Link key={q.id} href={`/normen/${q.normId}/eisen/${q.id}`} className="no-underline">
                      <Badge className="bg-brand-grey-light text-neutral-900">
                        {q.norm.code} {q.clause}
                      </Badge>
                    </Link>
                  ))}
                </dd>
              </>
            )}
          </dl>
        </section>

        <section className="card text-sm">
          <h2 className="mb-2">Analyse en effectiviteit</h2>
          <Info label="Oorzaakanalyse">
            {r.rootCause}
            {r.rootCauseMethod && <span className="text-xs text-neutral-500"> ({r.rootCauseMethod})</span>}
          </Info>
          {r.causeCategory && <p className="mt-1 text-xs text-neutral-500">Categorie: {r.causeCategory}</p>}
          <div className="mt-3">
            <Info label="Effectiviteit">
              {r.effective === null ? "Nog niet beoordeeld" : r.effective ? "Effectief" : "Niet effectief"}
              {r.effectivenessCheckedAt && ` (${formatDate(r.effectivenessCheckedAt)})`}
              {r.effectivenessNote && ` — ${r.effectivenessNote}`}
            </Info>
          </div>
          {r.closingNote && (
            <div className="mt-3">
              <Info label="Toelichting afsluiting">{r.closingNote}</Info>
            </div>
          )}
          {manage && r.status !== "CLOSED" && r.status !== "REJECTED" && (
            <div className="mt-4 space-y-2 border-t border-neutral-100 pt-3">
              {problems.length > 0 ? (
                <p className="text-xs text-neutral-500">Nog te doen voor afsluiten: {problems.join(" ")}</p>
              ) : (
                <Form action={setReportStatus.bind(null, id)}>
                  <input type="hidden" name="status" value="CLOSED" />
                  <SubmitButton>Melding afsluiten</SubmitButton>
                </Form>
              )}
              <Disclosure compact summary="Afwijzen (niet terecht of dubbel)">
                <Form action={setReportStatus.bind(null, id)} className="space-y-2">
                  <input type="hidden" name="status" value="REJECTED" />
                  <input name="closingNote" required maxLength={2000} className="input" placeholder="Waarom wordt de melding afgewezen?" />
                  <SubmitButton variant="secondary">Afwijzen</SubmitButton>
                </Form>
              </Disclosure>
            </div>
          )}
          {!NEEDS_ANALYSIS.includes(r.type) && <p className="mt-3 text-xs text-neutral-500">Bij een verbetervoorstel is geen oorzaakanalyse nodig.</p>}
        </section>
      </div>

      <section className="card mt-4">
        <h2 className="mb-3">Acties ({r.actions.length})</h2>
        {r.actions.length === 0 ? (
          <p className="mb-3 text-sm text-neutral-500">Nog geen acties.</p>
        ) : (
          <table className="table mb-3">
            <tbody>
              {r.actions.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link href={`/acties/${a.id}`}>
                      #{a.number} {a.title}
                    </Link>
                    <div className="text-xs text-neutral-500">{ACTION_KIND_LABEL[a.kind]}</div>
                  </td>
                  <td className="text-neutral-600">{a.owner?.name ?? a.ownerText ?? "—"}</td>
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
        {editable && can(user.role, "actions.create") && lookups && r.status !== "CLOSED" && r.status !== "REJECTED" && (
          <Disclosure compact summary="Actie toevoegen">
            <Form action={createReportAction.bind(null, id)} resetOnSuccess className="grid gap-3 md:grid-cols-4">
              <Field label="Actie" className="md:col-span-4">
                <input name="title" required maxLength={300} className="input" placeholder="Wat moet er gebeuren?" />
              </Field>
              <Field label="Soort">
                <Select name="kind" options={options(ACTION_KIND_LABEL)} defaultValue="CORRECTIVE" />
              </Field>
              <Field label="Eigenaar (gebruiker)">
                <Select name="ownerId" options={lookups.users} placeholder="—" />
              </Field>
              <Field label="Of eigenaar (naam / functie)">
                <input name="ownerText" maxLength={200} className="input" />
              </Field>
              <Field label="Deadline">
                <input name="deadline" type="date" className="input" />
              </Field>
              <Field label="Prioriteit">
                <Select
                  name="priority"
                  options={options(ACTION_PRIORITY_LABEL)}
                  defaultValue={r.severity === "HIGH" || r.severity === "SEVERE" ? "HIGH" : "MEDIUM"}
                />
              </Field>
              <Field label="Toelichting" className="md:col-span-3">
                <input name="description" maxLength={5000} className="input" />
              </Field>
              <div className="md:col-span-4">
                <SubmitButton variant="secondary">Actie opslaan</SubmitButton>
              </div>
            </Form>
          </Disclosure>
        )}
      </section>

      {editable && lookups && (
        <div className="mt-6">
          <Disclosure summary="Melding behandelen / wijzigen">
            <ReportForm
              key={r.updatedAt.toISOString()}
              report={r}
              formAction={updateReport.bind(null, id)}
              lookups={lookups}
              processes={processes.map((p) => ({ value: p.id, label: p.name }))}
              requirementGroups={requirementGroups}
              full
              canManage={manage}
              submitLabel="Opslaan"
            />
            {manage && (
              <Form action={deleteReport.bind(null, id)} className="mt-4 border-t border-neutral-200 pt-3">
                <SubmitButton variant="link" confirm={`${code} verwijderen? Gekoppelde acties blijven bestaan. Overweeg liever 'Afwijzen'.`}>
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
