import Link from "next/link";
import { notFound } from "next/navigation";
import type { AuditStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { can } from "@/lib/rbac";
import { getLookups, compareRequirementFlat } from "@/lib/lookups";
import { formatDate, formatDateTime, isOverdue } from "@/lib/format";
import { auditCode, findingCode } from "@/lib/audit-plan";
import {
  AUDIT_STATUS_CLASS,
  AUDIT_STATUS_LABEL,
  AUDIT_TYPE_CLASS,
  AUDIT_TYPE_LABEL,
  CHECKLIST_RESULT_CLASS,
  CHECKLIST_RESULT_LABEL,
  FINDING_CLASS_CLASS,
  FINDING_CLASS_LABEL,
  FINDING_CLASS_SHORT,
  FINDING_STATUS_LABEL,
  options,
} from "@/lib/labels";
import { Badge, Disclosure, EmptyState, Field, PageHeader, ProgressBar, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { CheckboxPicker } from "@/components/checkbox-picker";
import { AuditForm } from "@/components/audit-form";
import { addAllRequirements, createFinding, deleteAudit, saveChecklistResults, setAuditStatus, setChecklistItems, updateAudit } from "../actions";

const NEXT_STATUS: Record<AuditStatus, { status: AuditStatus; label: string }[]> = {
  PLANNED: [
    { status: "IN_PROGRESS", label: "Audit starten" },
    { status: "COMPLETED", label: "Afronden" },
  ],
  IN_PROGRESS: [{ status: "COMPLETED", label: "Afronden" }],
  COMPLETED: [{ status: "IN_PROGRESS", label: "Heropenen" }],
  CANCELLED: [{ status: "PLANNED", label: "Opnieuw plannen" }],
};

export default async function AuditDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const audit = await prisma.audit.findUnique({
    where: { id },
    include: {
      norms: { orderBy: { sortOrder: "asc" } },
      location: true,
      discipline: true,
      checklist: { include: { requirement: { include: { norm: { select: { id: true, code: true, sortOrder: true } } } } } },
      findings: {
        orderBy: { number: "asc" },
        include: { requirement: { include: { norm: { select: { code: true } } } }, actions: { select: { status: true } } },
      },
    },
  });
  if (!audit) notFound();
  await logAudit({ user, action: "VIEW", entityType: "Audit", entityId: id });

  const canEdit = can(user.role, "audits.edit");
  const code = auditCode(audit.number);
  const normIds = audit.norms.map((n) => n.id);

  // Checklist gegroepeerd per norm, in paragraafvolgorde.
  const groups = audit.norms
    .map((n) => ({
      norm: n,
      items: audit.checklist.filter((c) => c.requirement.normId === n.id).sort((a, b) => compareRequirementFlat(a.requirement, b.requirement)),
    }))
    .filter((g) => g.items.length);
  // Formulieren opnieuw opbouwen zodra de gegevens elders zijn gewijzigd (anders tonen ze verouderde waarden).
  const checklistVersion = audit.checklist.map((c) => `${c.id}:${c.updatedAt.getTime()}`).join("|");
  const assessed = audit.checklist.filter((c) => c.result !== "NOT_ASSESSED").length;
  const findingsByReq = new Map<string, typeof audit.findings>();
  for (const f of audit.findings) if (f.requirementId) findingsByReq.set(f.requirementId, [...(findingsByReq.get(f.requirementId) ?? []), f]);

  const [lookups, scopeRequirements] = canEdit
    ? await Promise.all([
        getLookups(),
        prisma.normRequirement.findMany({
          where: { normId: { in: normIds } },
          select: { id: true, clause: true, title: true, sortOrder: true, normId: true, _count: { select: { children: true } } },
        }),
      ])
    : [null, []];
  const normOptions = canEdit
    ? (await prisma.norm.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }], select: { id: true, code: true } })).map(
        (n) => ({
          value: n.id,
          label: n.code,
        }),
      )
    : [];
  const scopeGroups = audit.norms.map((n) => ({
    label: n.code,
    options: scopeRequirements
      .filter((r) => r.normId === n.id)
      .sort(compareRequirementFlat)
      .map((r) => ({ value: r.id, label: `${n.code} ${r.clause} — ${r.title}${r._count.children ? " (hoofdstuk)" : ""}` })),
  }));
  const requirementOptions = scopeGroups.flatMap((g) => g.options);

  const history = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entityType: "Audit", entityId: id },
        { entityType: "AuditFinding", entityId: { in: audit.findings.map((f) => f.id) } },
      ],
      action: { not: "VIEW" },
    },
    orderBy: { createdAt: "desc" },
    take: 25,
    include: { user: { select: { name: true } } },
  });

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/audits", label: "Audits" }]}
        title={`${code} ${audit.title}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge className={AUDIT_TYPE_CLASS[audit.type]}>{AUDIT_TYPE_LABEL[audit.type]}</Badge>
            <Badge className={AUDIT_STATUS_CLASS[audit.status]}>{AUDIT_STATUS_LABEL[audit.status]}</Badge>
            {audit.norms.map((n) => (
              <Badge key={n.id} className="bg-brand-grey-light text-neutral-900">
                {n.code}
              </Badge>
            ))}
          </span>
        }
        actions={
          canEdit &&
          NEXT_STATUS[audit.status].map((n) => (
            <Form key={n.status} action={setAuditStatus.bind(null, id, n.status)}>
              <SubmitButton variant={n.status === "COMPLETED" ? "primary" : "secondary"}>{n.label}</SubmitButton>
            </Form>
          ))
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card text-sm lg:col-span-2">
          <dl className="grid grid-cols-[10rem_1fr] gap-y-1.5">
            <dt className="text-neutral-500">Gepland</dt>
            <dd>{formatDate(audit.plannedDate)}</dd>
            <dt className="text-neutral-500">Uitgevoerd</dt>
            <dd>{formatDate(audit.completedDate)}</dd>
            <dt className="text-neutral-500">Auditor(s)</dt>
            <dd>{audit.auditor ?? "—"}</dd>
            {audit.certificationBody && (
              <>
                <dt className="text-neutral-500">{audit.type === "CUSTOMER" ? "Klant" : "Certificatie-instelling"}</dt>
                <dd>{audit.certificationBody}</dd>
              </>
            )}
            <dt className="text-neutral-500">Locatie</dt>
            <dd>{audit.location?.name ?? "Alle locaties"}</dd>
            <dt className="text-neutral-500">Discipline</dt>
            <dd>{audit.discipline?.name ?? "Bedrijfsbreed"}</dd>
            <dt className="text-neutral-500">Rapport</dt>
            <dd>
              {audit.reportUrl ? (
                <a href={audit.reportUrl} target="_blank" rel="noopener noreferrer">
                  Openen in SharePoint ↗
                </a>
              ) : (
                "—"
              )}
            </dd>
          </dl>
          {audit.scope && (
            <div className="mt-4">
              <div className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Scope</div>
              <p className="mt-0.5 whitespace-pre-line">{audit.scope}</p>
            </div>
          )}
          {audit.conclusion && (
            <div className="mt-4">
              <div className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Conclusie</div>
              <p className="mt-0.5 whitespace-pre-line">{audit.conclusion}</p>
            </div>
          )}
        </section>
        <section className="card text-sm">
          <h2 className="mb-3">Voortgang</h2>
          <div className="mb-1 text-xs text-neutral-500">Checklist getoetst</div>
          {audit.checklist.length ? <ProgressBar value={(assessed / audit.checklist.length) * 100} /> : <p className="text-neutral-500">Nog geen checklist.</p>}
          <div className="mt-1 text-xs text-neutral-500">
            {assessed} van {audit.checklist.length} eisen
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {(["MAJOR", "MINOR", "OBSERVATION"] as const).map((c) => (
              <div key={c} className="rounded-md bg-neutral-50 p-2">
                <div className={`text-2xl font-bold ${c === "MAJOR" && audit.findings.some((f) => f.classification === c) ? "text-brand-red" : ""}`}>
                  {audit.findings.filter((f) => f.classification === c).length}
                </div>
                <div className="text-xs text-neutral-500">{FINDING_CLASS_SHORT[c]}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Bevindingen */}
      <section className="card mt-4">
        <h2 className="mb-3">Bevindingen</h2>
        {audit.findings.length === 0 ? (
          <p className="mb-3 text-sm text-neutral-500">Nog geen bevindingen.</p>
        ) : (
          <table className="table mb-4">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Classificatie</th>
                <th>Bevinding</th>
                <th>Normeis</th>
                <th>Termijn</th>
                <th>Acties</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {audit.findings.map((f) => {
                const openActions = f.actions.filter((a) => a.status === "OPEN" || a.status === "IN_PROGRESS").length;
                const late = f.status === "OPEN" && isOverdue(f.dueDate);
                return (
                  <tr key={f.id}>
                    <td className="font-mono text-xs whitespace-nowrap">{findingCode(audit.number, f.number)}</td>
                    <td>
                      <Badge className={FINDING_CLASS_CLASS[f.classification]}>{FINDING_CLASS_SHORT[f.classification]}</Badge>
                    </td>
                    <td>
                      <Link href={`/audits/${id}/bevindingen/${f.id}`}>{f.description.length > 140 ? `${f.description.slice(0, 140)}…` : f.description}</Link>
                    </td>
                    <td className="text-xs whitespace-nowrap">{f.requirement ? `${f.requirement.norm.code} ${f.requirement.clause}` : "—"}</td>
                    <td className={`whitespace-nowrap ${late ? "font-semibold text-brand-red" : ""}`}>{formatDate(f.dueDate)}</td>
                    <td className="text-xs whitespace-nowrap">
                      {f.actions.length === 0 ? (
                        <span className={f.classification === "OBSERVATION" ? "text-neutral-400" : "text-brand-red"}>Geen</span>
                      ) : (
                        `${openActions} open / ${f.actions.length}`
                      )}
                    </td>
                    <td>
                      <Badge className={f.status === "OPEN" ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800"}>
                        {FINDING_STATUS_LABEL[f.status]}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {canEdit && (
          <Disclosure summary="Bevinding vastleggen">
            <Form resetOnSuccess action={createFinding.bind(null, id)} className="grid gap-3 md:grid-cols-4">
              <Field label="Classificatie">
                <Select name="classification" options={options(FINDING_CLASS_LABEL)} defaultValue="MINOR" />
              </Field>
              <Field label="Normeis" className="md:col-span-2">
                <Select name="requirementId" options={requirementOptions} placeholder="— Geen specifieke eis —" />
              </Field>
              <Field label="Afhandelen vóór">
                <input name="dueDate" type="date" className="input" />
              </Field>
              <Field label="Bevinding" className="md:col-span-4">
                <textarea name="description" required rows={3} className="input" placeholder="Wat is er vastgesteld, met objectief bewijs" />
              </Field>
              <Field label="Oorzaakanalyse (kan later)" className="md:col-span-4">
                <textarea name="rootCause" rows={2} className="input" />
              </Field>
              <div className="md:col-span-4">
                <SubmitButton>Bevinding opslaan</SubmitButton>
              </div>
            </Form>
          </Disclosure>
        )}
      </section>

      {/* Checklist */}
      <section className="card mt-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2>Checklist per norm</h2>
          <span className="text-xs text-neutral-500">
            Toets per eis: conform, bevinding of niet van toepassing, met een korte toelichting of verwijzing naar bewijs.
          </span>
        </div>
        {groups.length === 0 ? (
          <EmptyState>
            Nog geen eisen op de checklist.
            {canEdit && " Stel hieronder de checklist samen of voeg alle eisen van de normen toe."}
          </EmptyState>
        ) : canEdit ? (
          <Form key={checklistVersion} action={saveChecklistResults.bind(null, id)}>
            <ChecklistTable groups={groups} findingsByReq={findingsByReq} auditId={id} auditNumber={audit.number} editable />
            <div className="mt-3">
              <SubmitButton>Checklist opslaan</SubmitButton>
            </div>
          </Form>
        ) : (
          <ChecklistTable groups={groups} findingsByReq={findingsByReq} auditId={id} auditNumber={audit.number} />
        )}

        {canEdit && (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Disclosure summary="Checklist samenstellen">
              <Form action={setChecklistItems.bind(null, id)} className="space-y-3">
                <CheckboxPicker name="requirementIds" groups={scopeGroups} selected={audit.checklist.map((c) => c.requirementId)} height="18rem" />
                <p className="text-xs text-neutral-500">Uitvinken verwijdert de regel inclusief het ingevulde resultaat.</p>
                <SubmitButton>Checklist bijwerken</SubmitButton>
              </Form>
            </Disclosure>
            <div className="card">
              <p className="mb-3 text-sm text-neutral-600">
                Alle eisen (zonder hoofdstukken) van {audit.norms.map((n) => n.code).join(", ")} op de checklist zetten. Bestaande regels blijven staan.
              </p>
              <Form action={addAllRequirements.bind(null, id)}>
                <SubmitButton variant="secondary">Alle eisen toevoegen</SubmitButton>
              </Form>
            </div>
          </div>
        )}
      </section>

      {canEdit && lookups && (
        <div className="mt-6">
          <Disclosure summary="Audit wijzigen">
            <AuditForm
              key={audit.updatedAt.toISOString()}
              audit={audit}
              formAction={updateAudit.bind(null, id)}
              lookups={lookups}
              normOptions={normOptions}
              submitLabel="Opslaan"
            />
            <Form action={deleteAudit.bind(null, id)} className="mt-4 border-t border-neutral-200 pt-3">
              <SubmitButton
                variant="link"
                confirm={`${code} met checklist en bevindingen verwijderen? Gekoppelde acties blijven bestaan. Overweeg liever de status 'Geannuleerd'.`}
              >
                Audit verwijderen
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

type ChecklistGroup = {
  norm: { id: string; code: string };
  items: {
    id: string;
    result: keyof typeof CHECKLIST_RESULT_LABEL;
    notes: string | null;
    requirementId: string;
    requirement: { normId: string; clause: string; title: string };
  }[];
};

function ChecklistTable({
  groups,
  findingsByReq,
  auditId,
  auditNumber,
  editable,
}: {
  groups: ChecklistGroup[];
  findingsByReq: Map<string, { id: string; number: number; classification: keyof typeof FINDING_CLASS_SHORT }[]>;
  auditId: string;
  auditNumber: number;
  editable?: boolean;
}) {
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.norm.id}>
          <h3 className="mb-1 text-sm font-semibold">
            {g.norm.code}{" "}
            <span className="font-normal text-neutral-500">
              ({g.items.filter((i) => i.result !== "NOT_ASSESSED").length}/{g.items.length} getoetst)
            </span>
          </h3>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-20">Par.</th>
                  <th>Eis</th>
                  <th className="w-48">Resultaat</th>
                  <th>Toelichting / bewijs</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((item) => {
                  const fs = findingsByReq.get(item.requirementId) ?? [];
                  return (
                    <tr key={item.id}>
                      <td className="tabular-nums">{item.requirement.clause}</td>
                      <td>
                        <Link href={`/normen/${item.requirement.normId}/eisen/${item.requirementId}`} className="text-neutral-900">
                          {item.requirement.title}
                        </Link>
                        {fs.map((f) => (
                          <Link key={f.id} href={`/audits/${auditId}/bevindingen/${f.id}`} className="ml-1.5 no-underline">
                            <Badge className={FINDING_CLASS_CLASS[f.classification]}>
                              {findingCode(auditNumber, f.number)} {FINDING_CLASS_SHORT[f.classification]}
                            </Badge>
                          </Link>
                        ))}
                      </td>
                      <td>
                        {editable ? (
                          <select
                            name={`result_${item.id}`}
                            defaultValue={item.result}
                            className="input py-1.5"
                            aria-label={`Resultaat ${item.requirement.clause}`}
                          >
                            {options(CHECKLIST_RESULT_LABEL).map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Badge className={CHECKLIST_RESULT_CLASS[item.result]}>{CHECKLIST_RESULT_LABEL[item.result]}</Badge>
                        )}
                      </td>
                      <td>
                        {editable ? (
                          <input
                            name={`notes_${item.id}`}
                            defaultValue={item.notes ?? ""}
                            maxLength={5000}
                            className="input py-1.5"
                            aria-label={`Toelichting ${item.requirement.clause}`}
                          />
                        ) : (
                          <span className="whitespace-pre-line">{item.notes ?? "—"}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
