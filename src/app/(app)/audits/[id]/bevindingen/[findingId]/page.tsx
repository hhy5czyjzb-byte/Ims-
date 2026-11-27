import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { can } from "@/lib/rbac";
import { compareRequirementFlat, getLookups } from "@/lib/lookups";
import { formatDate, formatDateTime, isOverdue, toDateInput } from "@/lib/format";
import { auditCode, findingCode } from "@/lib/audit-plan";
import {
  ACTION_PRIORITY_LABEL,
  ACTION_STATUS_CLASS,
  ACTION_STATUS_LABEL,
  FINDING_CLASS_CLASS,
  FINDING_CLASS_LABEL,
  FINDING_STATUS_LABEL,
  options,
} from "@/lib/labels";
import { Badge, Disclosure, Field, PageHeader, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { createFindingAction, deleteFinding, setFindingStatus, updateFinding } from "../../../actions";

export default async function FindingPage({ params }: { params: Promise<{ id: string; findingId: string }> }) {
  const { id, findingId } = await params;
  const user = await requireUser();
  const finding = await prisma.auditFinding.findFirst({
    where: { id: findingId, auditId: id },
    include: {
      audit: { include: { norms: { orderBy: { sortOrder: "asc" } } } },
      requirement: { include: { norm: true } },
      actions: { orderBy: { number: "desc" }, include: { owner: { select: { name: true } } } },
    },
  });
  if (!finding) notFound();
  await logAudit({ user, action: "VIEW", entityType: "AuditFinding", entityId: findingId });

  const canEdit = can(user.role, "audits.edit");
  const code = findingCode(finding.audit.number, finding.number);
  const openActions = finding.actions.filter((a) => a.status === "OPEN" || a.status === "IN_PROGRESS").length;
  const late = finding.status === "OPEN" && isOverdue(finding.dueDate);

  const lookups = await getLookups();
  const requirementOptions = canEdit
    ? (
        await prisma.normRequirement.findMany({
          where: { normId: { in: finding.audit.norms.map((n) => n.id) } },
          select: { id: true, clause: true, title: true, sortOrder: true, norm: { select: { code: true, sortOrder: true } } },
        })
      )
        .sort((a, b) => a.norm.sortOrder - b.norm.sortOrder || compareRequirementFlat(a, b))
        .map((r) => ({ value: r.id, label: `${r.norm.code} ${r.clause} — ${r.title}` }))
    : [];
  const history = await prisma.auditLog.findMany({
    where: { entityType: "AuditFinding", entityId: findingId, action: { not: "VIEW" } },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { user: { select: { name: true } } },
  });

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/audits", label: "Audits" },
          { href: `/audits/${id}`, label: `${auditCode(finding.audit.number)} ${finding.audit.title}` },
        ]}
        title={`Bevinding ${code}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge className={FINDING_CLASS_CLASS[finding.classification]}>{FINDING_CLASS_LABEL[finding.classification]}</Badge>
            <Badge className={finding.status === "OPEN" ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800"}>
              {FINDING_STATUS_LABEL[finding.status]}
              {finding.closedAt && ` op ${formatDate(finding.closedAt)}`}
            </Badge>
          </span>
        }
        actions={
          canEdit && (
            <Form action={setFindingStatus.bind(null, id, findingId, finding.status === "OPEN" ? "CLOSED" : "OPEN")}>
              <SubmitButton variant={finding.status === "OPEN" ? "primary" : "secondary"}>
                {finding.status === "OPEN" ? "Afhandelen" : "Heropenen"}
              </SubmitButton>
            </Form>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card text-sm lg:col-span-2">
          <div className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Bevinding</div>
          <p className="mt-1 whitespace-pre-line">{finding.description}</p>
          <div className="mt-4 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Oorzaakanalyse</div>
          <p className="mt-1 whitespace-pre-line">
            {finding.rootCause || (
              <span className={finding.classification === "OBSERVATION" ? "text-neutral-400" : "text-brand-red"}>
                Nog niet vastgelegd{finding.classification !== "OBSERVATION" && " — verplicht vóór afhandeling"}
              </span>
            )}
          </p>
        </section>
        <section className="card text-sm">
          <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5">
            <dt className="text-neutral-500">Normeis</dt>
            <dd>
              {finding.requirement ? (
                <Link href={`/normen/${finding.requirement.normId}/eisen/${finding.requirement.id}`}>
                  {finding.requirement.norm.code} {finding.requirement.clause} {finding.requirement.title}
                </Link>
              ) : (
                "—"
              )}
            </dd>
            <dt className="text-neutral-500">Afhandelen vóór</dt>
            <dd className={late ? "font-semibold text-brand-red" : ""}>
              {formatDate(finding.dueDate)}
              {late && " — verlopen"}
            </dd>
            <dt className="text-neutral-500">Audit</dt>
            <dd>
              <Link href={`/audits/${id}`}>{auditCode(finding.audit.number)}</Link> ({formatDate(finding.audit.completedDate ?? finding.audit.plannedDate)})
            </dd>
            <dt className="text-neutral-500">Vastgelegd</dt>
            <dd>{formatDate(finding.createdAt)}</dd>
          </dl>
        </section>
      </div>

      <section className="card mt-4">
        <h2 className="mb-3">Corrigerende maatregelen (acties)</h2>
        {finding.actions.length === 0 ? (
          <p className="mb-3 text-sm text-neutral-500">Nog geen acties.</p>
        ) : (
          <table className="table mb-4">
            <tbody>
              {finding.actions.map((a) => (
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
        {openActions > 0 && finding.status === "OPEN" && (
          <p className="mb-3 text-xs text-neutral-500">Afhandelen kan zodra alle acties gereed of vervallen zijn.</p>
        )}
        {can(user.role, "actions.create") && finding.status === "OPEN" && (
          <Form
            resetOnSuccess
            action={createFindingAction.bind(null, id, findingId)}
            className="grid gap-2 border-t border-neutral-100 pt-3 md:grid-cols-[1fr_12rem_10rem_8rem_auto] md:items-end"
          >
            <Field label="Nieuwe actie">
              <input name="title" required maxLength={300} className="input" placeholder="Corrigerende maatregel" />
            </Field>
            <Field label="Eigenaar">
              <Select name="ownerId" options={lookups.users} placeholder="— Kies —" />
            </Field>
            <Field label="Deadline">
              <input name="deadline" type="date" defaultValue={toDateInput(finding.dueDate)} className="input" />
            </Field>
            <Field label="Prioriteit">
              <Select name="priority" options={options(ACTION_PRIORITY_LABEL)} defaultValue={finding.classification === "MAJOR" ? "HIGH" : "MEDIUM"} />
            </Field>
            <SubmitButton variant="secondary">Actie toevoegen</SubmitButton>
          </Form>
        )}
      </section>

      {canEdit && (
        <div className="mt-6">
          <Disclosure summary="Bevinding wijzigen" open={!finding.rootCause && finding.classification !== "OBSERVATION" && finding.status === "OPEN"}>
            <Form key={finding.updatedAt.toISOString()} action={updateFinding.bind(null, id, findingId)} className="grid gap-3 md:grid-cols-4">
              <Field label="Classificatie">
                <Select name="classification" options={options(FINDING_CLASS_LABEL)} defaultValue={finding.classification} />
              </Field>
              <Field label="Normeis" className="md:col-span-2">
                <Select name="requirementId" options={requirementOptions} defaultValue={finding.requirementId} placeholder="— Geen specifieke eis —" />
              </Field>
              <Field label="Afhandelen vóór">
                <input name="dueDate" type="date" defaultValue={toDateInput(finding.dueDate)} className="input" />
              </Field>
              <Field label="Bevinding" className="md:col-span-4">
                <textarea name="description" required rows={3} defaultValue={finding.description} className="input" />
              </Field>
              <Field label="Oorzaakanalyse" className="md:col-span-4">
                <textarea
                  name="rootCause"
                  rows={3}
                  defaultValue={finding.rootCause ?? ""}
                  className="input"
                  placeholder="Waarom is dit gebeurd? (bijv. 5×waarom)"
                />
              </Field>
              <div className="md:col-span-4">
                <SubmitButton>Opslaan</SubmitButton>
              </div>
            </Form>
            <Form action={deleteFinding.bind(null, id, findingId)} className="mt-4 border-t border-neutral-200 pt-3">
              <SubmitButton variant="link" confirm={`Bevinding ${code} verwijderen? Gekoppelde acties blijven bestaan.`}>
                Bevinding verwijderen
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
