import Link from "next/link";
import { notFound } from "next/navigation";
import type { AuditStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { can } from "@/lib/rbac";
import { getLookups } from "@/lib/lookups";
import { formatDate, toDateInput } from "@/lib/format";
import { legalDisplayCode } from "@/lib/compliance";
import {
  ACTION_PRIORITY_LABEL,
  ACTION_STATUS_CLASS,
  ACTION_STATUS_LABEL,
  AUDIT_STATUS_CLASS,
  AUDIT_STATUS_LABEL,
  COMPLIANCE_STATUS_CLASS,
  COMPLIANCE_STATUS_LABEL,
  options,
} from "@/lib/labels";
import { canFillLocationAudit, completionProblems, locationAuditCode, locationAuditScore, SCORE_BAND_CLASS, scoreBand } from "@/lib/location-audit";
import { Badge, Disclosure, EmptyState, Field, PageHeader, ProgressBar, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { LegalNav } from "@/components/legal-nav";
import { createLocationAuditAction, deleteLocationAudit, saveAnswers, setLocationAuditStatus, syncQuestions, updateLocationAudit } from "../actions";

export const metadata = { title: "Compliance-audit vestiging" };

const VERDICT_ORDER = ["NOT_ASSESSED", "COMPLIANT", "PARTIAL", "NON_COMPLIANT", "NOT_APPLICABLE"] as const;

export default async function LocationAuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const audit = await prisma.locationAudit.findUnique({
    where: { id },
    include: {
      location: true,
      auditor: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      answers: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          legalRequirement: { select: { id: true, number: true, externalRef: true, title: true } },
          actions: {
            select: { id: true, number: true, title: true, status: true, deadline: true, owner: { select: { name: true } } },
            orderBy: { number: "asc" },
          },
        },
      },
    },
  });
  if (!audit) notFound();
  await logAudit({ user, action: "VIEW", entityType: "LocationAudit", entityId: id, summary: `${locationAuditCode(audit.number)} bekeken` });

  const isQhse = can(user.role, "legal.edit");
  const isAuditor = audit.auditorId === user.id;
  const canFill = canFillLocationAudit(user, audit);
  const canAct = can(user.role, "actions.create") && (isQhse || isAuditor);
  const lookups = canAct || isQhse ? await getLookups() : null;
  const code = locationAuditCode(audit.number);
  const score = locationAuditScore(audit.answers.map((a) => a.verdict));
  const problems = completionProblems(audit.answers.map((a) => ({ verdict: a.verdict, actionCount: a.actions.length })));
  const version = `${audit.updatedAt.getTime()}|${audit.answers.map((a) => a.updatedAt.getTime()).join(",")}`;

  // Statusknoppen: auditor mag starten en afronden, QHSE alles.
  const next: { status: AuditStatus; label: string; qhseOnly?: boolean }[] =
    audit.status === "PLANNED"
      ? [
          { status: "IN_PROGRESS", label: "Audit starten" },
          { status: "CANCELLED", label: "Annuleren", qhseOnly: true },
        ]
      : audit.status === "IN_PROGRESS"
        ? [
            { status: "COMPLETED", label: "Audit afronden" },
            { status: "CANCELLED", label: "Annuleren", qhseOnly: true },
          ]
        : audit.status === "COMPLETED"
          ? [{ status: "IN_PROGRESS", label: "Heropenen", qhseOnly: true }]
          : [{ status: "PLANNED", label: "Heropenen", qhseOnly: true }];
  const buttons = next.filter((n) => isQhse || (isAuditor && !n.qhseOnly && audit.status !== "COMPLETED" && audit.status !== "CANCELLED"));

  // Groeperen per thema, in volgorde van de vragenbank.
  const groups: { theme: string; answers: typeof audit.answers }[] = [];
  for (const a of audit.answers) {
    const theme = a.theme ?? "Overig";
    const g = groups.find((x) => x.theme === theme);
    if (g) g.answers.push(a);
    else groups.push({ theme, answers: [a] });
  }
  const allActions = audit.answers.flatMap((a) => a.actions.map((act) => ({ ...act, answer: a })));

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/wetgeving", label: "Wet- en regelgeving" },
          { href: "/wetgeving/vestigingen", label: "Compliance-audit per vestiging" },
        ]}
        title={`${code} ${audit.location.name}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge className={AUDIT_STATUS_CLASS[audit.status]}>{AUDIT_STATUS_LABEL[audit.status]}</Badge>
            <span>Audit van {formatDate(audit.date)}</span>
          </span>
        }
        actions={buttons.map((n) => (
          <Form key={n.status} action={setLocationAuditStatus.bind(null, id, n.status)}>
            <SubmitButton variant={n.status === "COMPLETED" ? "primary" : "secondary"}>{n.label}</SubmitButton>
          </Form>
        ))}
      />
      <LegalNav />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <section className="card text-sm lg:col-span-2">
          <dl className="grid grid-cols-[10rem_1fr] gap-y-1.5">
            <dt className="text-neutral-500">Vestiging</dt>
            <dd>
              {audit.location.name}
              {audit.location.address && (
                <span className="text-neutral-500"> · {[audit.location.address, audit.location.city].filter(Boolean).join(", ")}</span>
              )}
            </dd>
            {audit.location.activities && (
              <>
                <dt className="text-neutral-500">Activiteiten</dt>
                <dd className="whitespace-pre-line">{audit.location.activities}</dd>
              </>
            )}
            <dt className="text-neutral-500">Datum audit</dt>
            <dd>{formatDate(audit.date)}</dd>
            <dt className="text-neutral-500">Auditor</dt>
            <dd>{audit.auditor?.name ?? audit.auditorText ?? "—"}</dd>
            {audit.notes && (
              <>
                <dt className="text-neutral-500">Opmerking</dt>
                <dd className="whitespace-pre-line">{audit.notes}</dd>
              </>
            )}
            <dt className="text-neutral-500">Vastgelegd</dt>
            <dd>
              {formatDate(audit.createdAt)}
              {audit.createdBy && ` door ${audit.createdBy.name}`}
            </dd>
          </dl>
        </section>
        <section className="card text-sm">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-neutral-500">Beoordeeld</span>
            <span className="tabular-nums">
              {score.assessed} van {score.total}
            </span>
          </div>
          <ProgressBar value={score.total ? (score.assessed / score.total) * 100 : 0} />
          <div className="mt-3 flex items-center gap-2">
            <span className="text-neutral-500">Score</span>
            <Badge className={SCORE_BAND_CLASS[scoreBand(score.pct)]}>{score.pct === null ? "—" : `${score.pct.toLocaleString("nl-NL")}%`}</Badge>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge className={COMPLIANCE_STATUS_CLASS.COMPLIANT}>{score.compliant} voldoet</Badge>
            <Badge className={COMPLIANCE_STATUS_CLASS.PARTIAL}>{score.partial} deels</Badge>
            <Badge className={COMPLIANCE_STATUS_CLASS.NON_COMPLIANT}>{score.nonCompliant} voldoet niet</Badge>
            <Badge className={COMPLIANCE_STATUS_CLASS.NOT_APPLICABLE}>{score.notApplicable} n.v.t.</Badge>
          </div>
          {audit.status !== "COMPLETED" && audit.status !== "CANCELLED" && problems.length > 0 && (
            <p className="mt-3 text-xs text-neutral-500">Nog te doen voor afronden: {problems.join(" ")}</p>
          )}
        </section>
      </div>

      <section className="card mb-6">
        <h2 className="mb-1">Checklist</h2>
        <p className="mb-4 text-sm text-neutral-600">
          Loop per vraag het bewijs langs en leg oordeel en bevinding vast. Bij &lsquo;voldoet niet&rsquo; is een actie verplicht voordat de audit kan worden
          afgerond.
          {!canFill && audit.status !== "COMPLETED" && " Alleen QHSE of de aangewezen auditor kan de checklist invullen."}
        </p>
        {audit.answers.length === 0 ? (
          <EmptyState>Geen vragen op deze checklist.</EmptyState>
        ) : canFill ? (
          <Form key={version} action={saveAnswers.bind(null, id)}>
            <Checklist groups={groups} editable />
            <div className="sticky bottom-0 mt-4 border-t border-neutral-200 bg-white py-3">
              <SubmitButton>Checklist opslaan</SubmitButton>
            </div>
          </Form>
        ) : (
          <Checklist groups={groups} />
        )}
      </section>

      <section className="card mb-6">
        <h2 className="mb-3">Acties ({allActions.length})</h2>
        {allActions.length === 0 ? (
          <p className="mb-3 text-sm text-neutral-500">Nog geen acties.</p>
        ) : (
          <ul className="mb-4 divide-y divide-neutral-100 text-sm">
            {allActions.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 py-2">
                <Link href={`/acties/${a.id}`}>
                  #{a.number} {a.title}
                </Link>
                <Badge className={ACTION_STATUS_CLASS[a.status]}>{ACTION_STATUS_LABEL[a.status]}</Badge>
                <span className="text-xs text-neutral-500">
                  {a.answer.legalRequirement ? legalDisplayCode(a.answer.legalRequirement) : "Vraag"} · {a.owner?.name ?? "geen eigenaar"}
                  {a.deadline && ` · uiterlijk ${formatDate(a.deadline)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
        {canAct && lookups && (
          <Disclosure summary="Actie toevoegen">
            <Form action={createLocationAuditAction.bind(null, id)} resetOnSuccess className="grid gap-3 md:grid-cols-4">
              <Field label="Bij vraag" className="md:col-span-4">
                <Select
                  name="answerId"
                  options={audit.answers.map((a) => ({
                    value: a.id,
                    label: `${a.legalRequirement ? `${legalDisplayCode(a.legalRequirement)} — ` : ""}${a.questionText.slice(0, 110)}${a.verdict !== "NOT_ASSESSED" ? ` (${COMPLIANCE_STATUS_LABEL[a.verdict].toLowerCase()})` : ""}`,
                  }))}
                  placeholder="— Kies —"
                />
              </Field>
              <Field label="Actie" className="md:col-span-4">
                <input name="title" required maxLength={300} className="input" />
              </Field>
              <Field label="Toelichting" className="md:col-span-4">
                <textarea name="description" rows={2} className="input" />
              </Field>
              <Field label="Eigenaar">
                <Select name="ownerId" options={lookups.users} placeholder="— Kies —" />
              </Field>
              <Field label="Termijn">
                <input name="deadline" type="date" className="input" />
              </Field>
              <Field label="Prioriteit">
                <Select name="priority" options={options(ACTION_PRIORITY_LABEL)} defaultValue="MEDIUM" />
              </Field>
              <div className="self-end">
                <SubmitButton>Actie opslaan</SubmitButton>
              </div>
            </Form>
          </Disclosure>
        )}
      </section>

      {isQhse && lookups && (
        <Disclosure summary="Audit wijzigen">
          <Form key={audit.updatedAt.toISOString()} action={updateLocationAudit.bind(null, id)} className="grid gap-3 md:grid-cols-3">
            <Field label="Datum audit">
              <input name="date" type="date" required defaultValue={toDateInput(audit.date)} className="input" />
            </Field>
            <Field label="Auditor (gebruiker)">
              <Select name="auditorId" options={lookups.users} defaultValue={audit.auditorId} placeholder="— Geen —" />
            </Field>
            <Field label="Of auditor (naam)">
              <input name="auditorText" maxLength={200} defaultValue={audit.auditorText ?? ""} className="input" />
            </Field>
            <Field label="Opmerking" className="md:col-span-3">
              <textarea name="notes" rows={2} defaultValue={audit.notes ?? ""} className="input" />
            </Field>
            <div className="md:col-span-3">
              <SubmitButton>Opslaan</SubmitButton>
            </div>
          </Form>
          <div className="mt-4 flex flex-wrap gap-4 border-t border-neutral-200 pt-3">
            {audit.status !== "COMPLETED" && audit.status !== "CANCELLED" && (
              <Form action={syncQuestions.bind(null, id)}>
                <SubmitButton variant="secondary">Nieuwe vragen uit de vragenbank toevoegen</SubmitButton>
              </Form>
            )}
            <Form action={deleteLocationAudit.bind(null, id)}>
              <SubmitButton variant="link" confirm={`${code} met alle antwoorden verwijderen? Gekoppelde acties blijven bestaan. Overweeg liever 'Annuleren'.`}>
                Audit verwijderen
              </SubmitButton>
            </Form>
          </div>
        </Disclosure>
      )}
    </>
  );
}

type Answer = {
  id: string;
  questionText: string;
  evidenceHint: string | null;
  verdict: (typeof VERDICT_ORDER)[number];
  finding: string | null;
  legalRequirement: { id: string; number: number; externalRef: string | null; title: string } | null;
  actions: { id: string; number: number; status: keyof typeof ACTION_STATUS_LABEL }[];
};

function Checklist({ groups, editable }: { groups: { theme: string; answers: Answer[] }[]; editable?: boolean }) {
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.theme}>
          <h3 className="mb-1 text-sm font-semibold">
            {g.theme}{" "}
            <span className="font-normal text-neutral-500">
              ({g.answers.filter((a) => a.verdict !== "NOT_ASSESSED").length}/{g.answers.length} beoordeeld)
            </span>
          </h3>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-56">Verplichting</th>
                  <th>Auditvraag</th>
                  <th className="w-44">Oordeel</th>
                  <th className="w-80">Bevinding</th>
                </tr>
              </thead>
              <tbody>
                {g.answers.map((a, i) => (
                  <tr key={a.id}>
                    <td className="text-xs">
                      {a.legalRequirement ? (
                        <Link href={`/wetgeving/${a.legalRequirement.id}`}>
                          <span className="font-mono">{legalDisplayCode(a.legalRequirement)}</span> {a.legalRequirement.title}
                        </Link>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td>
                      <div>{a.questionText}</div>
                      {a.evidenceHint && <div className="text-xs text-neutral-500">Bewijs: {a.evidenceHint}</div>}
                      {a.actions.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {a.actions.map((act) => (
                            <Link key={act.id} href={`/acties/${act.id}`} className="no-underline">
                              <Badge className={ACTION_STATUS_CLASS[act.status]}>Actie #{act.number}</Badge>
                            </Link>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      {editable ? (
                        <select name={`verdict_${a.id}`} defaultValue={a.verdict} className="input py-1.5" aria-label={`Oordeel vraag ${i + 1} ${g.theme}`}>
                          {VERDICT_ORDER.map((v) => (
                            <option key={v} value={v}>
                              {v === "NOT_ASSESSED" ? "Nog niet beoordeeld" : COMPLIANCE_STATUS_LABEL[v]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Badge className={COMPLIANCE_STATUS_CLASS[a.verdict]}>
                          {a.verdict === "NOT_ASSESSED" ? "Nog niet beoordeeld" : COMPLIANCE_STATUS_LABEL[a.verdict]}
                        </Badge>
                      )}
                    </td>
                    <td>
                      {editable ? (
                        <textarea
                          name={`finding_${a.id}`}
                          defaultValue={a.finding ?? ""}
                          rows={1}
                          maxLength={5000}
                          className="input py-1.5"
                          aria-label={`Bevinding vraag ${i + 1} ${g.theme}`}
                        />
                      ) : (
                        <span className="whitespace-pre-line">{a.finding ?? "—"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
