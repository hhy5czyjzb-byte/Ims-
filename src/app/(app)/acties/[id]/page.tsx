import Link from "next/link";
import { notFound } from "next/navigation";
import type { ActionStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { can, canEditAction } from "@/lib/rbac";
import { getLookups, getRequirementOptions } from "@/lib/lookups";
import { formatDate, formatDateTime, isOverdue } from "@/lib/format";
import { ACTION_PRIORITY_LABEL, ACTION_SOURCE_LABEL, ACTION_STATUS_CLASS, ACTION_STATUS_LABEL } from "@/lib/labels";
import { Badge, Disclosure, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ActionForm } from "@/components/action-form";
import { deleteAction, setActionStatus, updateAction } from "../actions";
import { Form } from "@/components/form";

const NEXT_STATUS: Partial<Record<ActionStatus, { status: ActionStatus; label: string }[]>> = {
  OPEN: [
    { status: "IN_PROGRESS", label: "Start uitvoering" },
    { status: "DONE", label: "Gereed melden" },
  ],
  IN_PROGRESS: [{ status: "DONE", label: "Gereed melden" }],
  DONE: [{ status: "IN_PROGRESS", label: "Heropenen" }],
  CANCELLED: [{ status: "OPEN", label: "Heropenen" }],
};

export default async function ActionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const action = await prisma.action.findUnique({
    where: { id },
    include: {
      owner: true,
      createdBy: true,
      discipline: true,
      location: true,
      requirements: { include: { norm: true } },
      risk: true,
      finding: { include: { audit: true } },
    },
  });
  if (!action) notFound();
  await logAudit({ user, action: "VIEW", entityType: "Action", entityId: id });

  const editable = canEditAction(user, action);
  const overdue = (action.status === "OPEN" || action.status === "IN_PROGRESS") && isOverdue(action.deadline);
  const [lookups, requirementGroups] = editable ? await Promise.all([getLookups(), getRequirementOptions()]) : [null, []];
  const history = await prisma.auditLog.findMany({
    where: { entityType: "Action", entityId: id, action: { not: "VIEW" } },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { user: { select: { name: true } } },
  });

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/acties", label: "Acties" }]}
        title={`#${action.number} ${action.title}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge className={ACTION_STATUS_CLASS[action.status]}>{ACTION_STATUS_LABEL[action.status]}</Badge>
            <span>Prioriteit {ACTION_PRIORITY_LABEL[action.priority].toLowerCase()}</span>
            <span>· Bron: {ACTION_SOURCE_LABEL[action.source]}</span>
          </span>
        }
        actions={
          editable &&
          NEXT_STATUS[action.status]?.map((n) => (
            <Form key={n.status} action={setActionStatus.bind(null, id, n.status)}>
              <SubmitButton variant={n.status === "DONE" ? "primary" : "secondary"}>{n.label}</SubmitButton>
            </Form>
          ))
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card text-sm lg:col-span-2">
          <h2 className="mb-2">Omschrijving</h2>
          <p className="whitespace-pre-line">{action.description || <span className="text-neutral-500">Geen omschrijving.</span>}</p>
          {action.result && (
            <>
              <h2 className="mt-5 mb-2">Resultaat / evaluatie</h2>
              <p className="whitespace-pre-line">{action.result}</p>
            </>
          )}
          {action.requirements.length > 0 && (
            <>
              <h2 className="mt-5 mb-2">Normeisen</h2>
              <ul className="space-y-1">
                {action.requirements.map((r) => (
                  <li key={r.id}>
                    <Link href={`/normen/${r.normId}/eisen/${r.id}`}>
                      <Badge className="mr-1 bg-brand-grey-light text-neutral-900">{r.norm.code}</Badge>
                      {r.clause} {r.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="card text-sm">
          <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5">
            <dt className="text-neutral-500">Eigenaar</dt>
            <dd>{action.owner?.name ?? <span className="text-brand-red">Geen</span>}</dd>
            <dt className="text-neutral-500">Deadline</dt>
            <dd className={overdue ? "font-semibold text-brand-red" : ""}>
              {formatDate(action.deadline)}
              {overdue && " — verlopen"}
            </dd>
            <dt className="text-neutral-500">Discipline</dt>
            <dd>{action.discipline?.name ?? "Bedrijfsbreed"}</dd>
            <dt className="text-neutral-500">Locatie</dt>
            <dd>{action.location?.name ?? "Alle locaties"}</dd>
            <dt className="text-neutral-500">Aangemaakt</dt>
            <dd>
              {formatDate(action.createdAt)}
              {action.createdBy && ` door ${action.createdBy.name}`}
            </dd>
            {action.completedAt && (
              <>
                <dt className="text-neutral-500">Gereed op</dt>
                <dd>{formatDate(action.completedAt)}</dd>
              </>
            )}
            {action.finding && (
              <>
                <dt className="text-neutral-500">Audit</dt>
                <dd>{action.finding.audit.title}</dd>
              </>
            )}
            {action.risk && (
              <>
                <dt className="text-neutral-500">Risico</dt>
                <dd>{action.risk.title}</dd>
              </>
            )}
          </dl>
        </div>
      </div>

      {editable && lookups && (
        <div className="mt-6">
          <Disclosure summary="Actie wijzigen">
            <ActionForm
              action={action}
              formAction={updateAction.bind(null, id)}
              lookups={lookups}
              requirementGroups={requirementGroups}
              submitLabel="Opslaan"
            />
            {can(user.role, "actions.editAny") && (
              <Form action={deleteAction.bind(null, id)} className="mt-4 border-t border-neutral-200 pt-3">
                <SubmitButton variant="link" confirm="Actie definitief verwijderen? Overweeg liever de status 'Vervallen'.">
                  Actie verwijderen
                </SubmitButton>
              </Form>
            )}
          </Disclosure>
        </div>
      )}

      <div className="card mt-6">
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
      </div>
    </>
  );
}
