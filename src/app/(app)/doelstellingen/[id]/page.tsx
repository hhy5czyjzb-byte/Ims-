import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can, canReviewObjective } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { formatDate, toDateInput } from "@/lib/format";
import {
  ACTION_STATUS_CLASS,
  ACTION_STATUS_LABEL,
  OBJECTIVE_CATEGORY_CLASS,
  OBJECTIVE_CATEGORY_LABEL,
  OBJECTIVE_STATUS_CLASS,
  OBJECTIVE_STATUS_LABEL,
} from "@/lib/labels";
import { FINAL_STATUSES, STATUS_COLOR, objectiveDisplayCode, objectiveProgress, suggestStatus } from "@/lib/objectives";
import { getObjectiveLookups } from "@/lib/objective-data";
import { Badge, Disclosure, Field, PageHeader, ProgressBar } from "@/components/ui";
import { ChartCard } from "@/components/charts";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { ObjectiveForm } from "@/components/objective-form";
import { createObjectiveAction, deleteObjective, reviewObjective, updateObjective } from "../actions";
import type { ObjectiveStatus } from "@prisma/client";

export const metadata = { title: "Doelstelling" };

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const fmt = (v: number | null, unit?: string | null) =>
  v === null ? "—" : `${v.toLocaleString("nl-NL", { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ""}`;

export default async function ObjectivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const o = await prisma.objective.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true } },
      discipline: { select: { name: true } },
      reductionTarget: { select: { id: true, title: true } },
      norms: { select: { id: true, code: true } },
      requirements: { select: { id: true, clause: true, title: true, norm: { select: { code: true } } } },
      reviews: { orderBy: [{ date: "desc" }, { createdAt: "desc" }], include: { user: { select: { name: true } } } },
      actions: { orderBy: { number: "asc" }, include: { owner: { select: { name: true } } } },
    },
  });
  if (!o) notFound();
  await logAudit({ user, action: "VIEW", entityType: "Objective", entityId: id });
  const canEdit = can(user.role, "objectives.edit");
  const canReview = canReviewObjective(user, o);
  const lookups = canEdit ? await getObjectiveLookups() : null;
  const users = can(user.role, "actions.create")
    ? await prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })
    : [];

  const base = n(o.baselineValue);
  const target = n(o.targetValue);
  const current = n(o.currentValue);
  const prog = objectiveProgress(base, target, current);
  const lastManual = o.reviews.find((r) => r.progressPct !== null)?.progressPct ?? null;
  const progressPct = prog?.pct ?? lastManual;
  const suggestion = suggestStatus(progressPct, o.startDate ?? o.createdAt, o.deadline);
  const now = new Date();
  const late = o.nextReviewDate && o.nextReviewDate < now && !FINAL_STATUSES.includes(o.status) && o.status !== "CANCELLED";

  // Verloop: voortgang per beoordeling (oud → nieuw).
  const history = [...o.reviews].reverse().map((r) => {
    const p = objectiveProgress(base, target, n(r.currentValue));
    return { r, pct: p?.pct ?? r.progressPct };
  });
  const hasChart = history.some((h) => h.pct !== null);

  return (
    <>
      <PageHeader
        title={`${objectiveDisplayCode(o)} ${o.title}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge className={OBJECTIVE_CATEGORY_CLASS[o.category]}>{OBJECTIVE_CATEGORY_LABEL[o.category]}</Badge>
            <Badge className={OBJECTIVE_STATUS_CLASS[o.status]}>{OBJECTIVE_STATUS_LABEL[o.status]}</Badge>
            {!o.active && <Badge>niet actief</Badge>}
            {late && <span className="text-xs font-semibold text-brand-red">beoordeling verlopen sinds {formatDate(o.nextReviewDate)}</span>}
          </span>
        }
        breadcrumb={[{ href: "/doelstellingen", label: "Doelstellingen" }]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          {o.description && <p className="mb-4 text-sm whitespace-pre-line text-neutral-700">{o.description}</p>}
          <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-neutral-500">Indicator</dt>
            <dd>{o.indicator ?? "—"}</dd>
            <dt className="text-neutral-500">Nulmeting</dt>
            <dd>{o.baselineText ?? fmt(base, o.unit)}</dd>
            <dt className="text-neutral-500">Streefwaarde</dt>
            <dd className="font-medium">{o.targetText ?? fmt(target, o.unit)}</dd>
            <dt className="text-neutral-500">Laatst gemeten</dt>
            <dd>{fmt(current, o.unit)}</dd>
            <dt className="text-neutral-500">Voortgang</dt>
            <dd className="max-w-xs">
              {progressPct !== null ? (
                <ProgressBar value={progressPct} />
              ) : (
                <span className="text-neutral-400">nog niet te berekenen (vul getallen in of geef een % bij de beoordeling)</span>
              )}
            </dd>
            <dt className="text-neutral-500">Eigenaar</dt>
            <dd>{o.owner?.name ?? o.ownerText ?? "—"}</dd>
            <dt className="text-neutral-500">Termijn</dt>
            <dd>
              {o.startDate && `${formatDate(o.startDate)} – `}
              {o.deadline ? formatDate(o.deadline) : (o.termText ?? "—")}
            </dd>
            <dt className="text-neutral-500">Bedrijfsonderdeel</dt>
            <dd>{o.discipline?.name ?? "Hele groep"}</dd>
            <dt className="text-neutral-500">Beoordelen</dt>
            <dd>
              elke {o.reviewIntervalMonths} maand(en) · laatst {formatDate(o.lastReviewDate)} · volgende{" "}
              {FINAL_STATUSES.includes(o.status) ? "—" : formatDate(o.nextReviewDate)}
            </dd>
            {o.norms.length > 0 && (
              <>
                <dt className="text-neutral-500">Geldt voor</dt>
                <dd>{o.norms.map((x) => x.code).join(", ")}</dd>
              </>
            )}
            {o.requirements.length > 0 && (
              <>
                <dt className="text-neutral-500">Normeisen</dt>
                <dd className="space-y-0.5">
                  {o.requirements.map((r) => (
                    <div key={r.id}>
                      {r.norm.code} {r.clause} {r.title}
                    </div>
                  ))}
                </dd>
              </>
            )}
            {o.reductionTarget && (
              <>
                <dt className="text-neutral-500">CO2-reductiedoel</dt>
                <dd>
                  <Link href={`/co2/doelstellingen/${o.reductionTarget.id}`}>{o.reductionTarget.title}</Link>
                </dd>
              </>
            )}
          </dl>
        </section>

        <aside className="space-y-4">
          {canReview && (
            <section className="card">
              <h2 className="mb-2">Voortgang beoordelen</h2>
              <Form action={reviewObjective.bind(null, o.id)} resetOnSuccess className="space-y-3">
                <Field label="Status">
                  <select name="status" required className="input" defaultValue={suggestion ?? (o.status === "NOT_ASSESSED" ? "" : o.status)}>
                    <option value="">— Kies —</option>
                    {(["ON_TRACK", "AT_RISK", "OFF_TRACK", "ACHIEVED", "PARTIAL", "NOT_ACHIEVED", "CANCELLED"] as ObjectiveStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {OBJECTIVE_STATUS_LABEL[s]}
                        {s === suggestion ? " (voorstel)" : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={`Gemeten waarde${o.unit ? ` (${o.unit})` : ""}`}>
                    <input name="currentValue" inputMode="decimal" className="input" />
                  </Field>
                  <Field label="Of voortgang %">
                    <input name="progressPct" type="number" min={0} max={100} className="input" />
                  </Field>
                </div>
                <Field label="Datum">
                  <input name="date" type="date" className="input" defaultValue={toDateInput(new Date())} max={toDateInput(new Date())} />
                </Field>
                <Field label="Toelichting (oorzaak en vervolg)" hint="Verplicht bij aandacht nodig, achter op schema of niet behaald.">
                  <textarea name="explanation" rows={3} className="input" />
                </Field>
                <SubmitButton>Beoordeling vastleggen</SubmitButton>
              </Form>
              {suggestion && (
                <p className="mt-2 text-xs text-neutral-500">
                  Voorstel op basis van voortgang en verstreken tijd: {OBJECTIVE_STATUS_LABEL[suggestion].toLowerCase()}.
                </p>
              )}
            </section>
          )}
        </aside>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="mb-3">Beoordelingen (historie)</h2>
          {o.reviews.length === 0 ? (
            <p className="text-sm text-neutral-500">Nog niet beoordeeld.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Status</th>
                  <th>Gemeten</th>
                  <th>Toelichting</th>
                  <th>Door</th>
                </tr>
              </thead>
              <tbody>
                {o.reviews.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{formatDate(r.date)}</td>
                    <td>
                      <Badge className={OBJECTIVE_STATUS_CLASS[r.status]}>{OBJECTIVE_STATUS_LABEL[r.status]}</Badge>
                    </td>
                    <td className="whitespace-nowrap">
                      {r.currentValue !== null ? fmt(n(r.currentValue), o.unit) : r.progressPct !== null ? `${r.progressPct}%` : "—"}
                    </td>
                    <td className="text-sm whitespace-pre-line">{r.explanation ?? ""}</td>
                    <td className="text-xs">{r.user?.name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <ChartCard title="Verloop van de voortgang" subtitle="Per beoordeling, kleur = status">
          {hasChart ? (
            <div className="flex h-40 items-end gap-[2px] border-b border-neutral-300">
              {history.map(({ r, pct }) => (
                <div
                  key={r.id}
                  className="group relative flex h-full flex-1 flex-col items-center justify-end"
                  title={`${formatDate(r.date)}: ${pct ?? "—"}% · ${OBJECTIVE_STATUS_LABEL[r.status]}`}
                >
                  <span className="mb-0.5 text-[10px] text-neutral-600 tabular-nums">{pct !== null ? `${pct}%` : ""}</span>
                  <span className="w-full max-w-6 rounded-t-[4px]" style={{ height: `${Math.max(pct ?? 0, 2) * 0.85}%`, background: STATUS_COLOR[r.status] }} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-500">Nog geen meetwaarden of percentages vastgelegd.</p>
          )}
          {hasChart && (
            <div className="mt-1 flex gap-[2px] text-center text-[10px] text-neutral-500">
              {history.map(({ r }) => (
                <span key={r.id} className="flex-1 truncate">
                  {r.date.toLocaleDateString("nl-NL", { month: "short", year: "2-digit", timeZone: "Europe/Amsterdam" })}
                </span>
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      <section className="card mt-6">
        <h2 className="mb-3">Acties (maatregelen om het doel te halen)</h2>
        {o.actions.length > 0 && (
          <table className="table mb-3">
            <tbody>
              {o.actions.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap">
                    <Link href={`/acties/${a.id}`}>#{a.number}</Link>
                  </td>
                  <td>{a.title}</td>
                  <td className="text-xs">{a.owner?.name ?? a.ownerText ?? "—"}</td>
                  <td className="text-xs whitespace-nowrap">{formatDate(a.deadline)}</td>
                  <td>
                    <Badge className={ACTION_STATUS_CLASS[a.status]}>{ACTION_STATUS_LABEL[a.status]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {can(user.role, "actions.create") && (
          <Form resetOnSuccess action={createObjectiveAction.bind(null, o.id)} className="grid gap-3 sm:grid-cols-4">
            <Field label="Nieuwe actie" className="sm:col-span-2">
              <input name="title" required maxLength={300} className="input" />
            </Field>
            <Field label="Eigenaar">
              <select name="ownerId" className="input" defaultValue="">
                <option value="">—</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Deadline">
              <input name="deadline" type="date" className="input" />
            </Field>
            <div>
              <SubmitButton variant="secondary">Actie toevoegen</SubmitButton>
            </div>
          </Form>
        )}
      </section>

      {canEdit && lookups && (
        <section className="mt-6 print:hidden">
          <Disclosure compact summary="Doelstelling wijzigen">
            <div className="mt-3">
              <ObjectiveForm
                key={o.updatedAt.toISOString()}
                objective={o}
                formAction={updateObjective.bind(null, o.id)}
                lookups={lookups}
                submitLabel="Opslaan"
              />
            </div>
            <Form action={deleteObjective.bind(null, o.id)} className="mt-3">
              <SubmitButton variant="link" confirm={`Doelstelling "${o.title}" verwijderen?`}>
                Verwijderen
              </SubmitButton>
            </Form>
          </Disclosure>
        </section>
      )}
    </>
  );
}
