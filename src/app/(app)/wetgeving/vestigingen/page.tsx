import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { getLookups } from "@/lib/lookups";
import { formatDate, toDateInput } from "@/lib/format";
import { AUDIT_STATUS_CLASS, AUDIT_STATUS_LABEL } from "@/lib/labels";
import { locationAuditCode, locationAuditScore, SCORE_BAND_CLASS, scoreBand } from "@/lib/location-audit";
import { Badge, Disclosure, EmptyState, Field, PageHeader, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { LegalNav } from "@/components/legal-nav";
import { createAuditsForAllLocations, createLocationAudit } from "./actions";

export const metadata = { title: "Compliance-audit per vestiging" };

function pctText(pct: number | null) {
  return pct === null ? "—" : `${pct.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%`;
}

export default async function LocationAuditsPage() {
  const user = await requireUser();
  const canEdit = can(user.role, "legal.edit");

  const [locations, audits, openActions, questionCount, lookups] = await Promise.all([
    prisma.location.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.locationAudit.findMany({
      orderBy: [{ date: "desc" }, { number: "desc" }],
      include: {
        location: { select: { name: true } },
        auditor: { select: { name: true } },
        answers: { select: { verdict: true } },
      },
    }),
    prisma.action.findMany({ where: { source: "LOCATION_AUDIT", status: { in: ["OPEN", "IN_PROGRESS"] } }, select: { locationId: true } }),
    prisma.complianceQuestion.count({ where: { active: true } }),
    getLookups(),
  ]);

  const openByLocation = new Map<string, number>();
  for (const a of openActions) if (a.locationId) openByLocation.set(a.locationId, (openByLocation.get(a.locationId) ?? 0) + 1);
  const latestByLocation = new Map<string, (typeof audits)[number]>();
  const lastCompleted = new Map<string, Date>();
  for (const a of audits) {
    if (a.status === "CANCELLED") continue;
    if (!latestByLocation.has(a.locationId)) latestByLocation.set(a.locationId, a);
    if (a.status === "COMPLETED" && !lastCompleted.has(a.locationId)) lastCompleted.set(a.locationId, a.date);
  }

  return (
    <>
      <PageHeader
        title="Wet- en regelgeving"
        description="Per vestiging de auditvragen langslopen: voldoen we hier aan de wettelijke eisen? Score = voldoet gedeeld door alle beoordeelde vragen zonder n.v.t. (groen vanaf 90%, geel vanaf 70%)."
        actions={
          <>
            {canEdit && (
              <Link href="/wetgeving/vestigingen/import" className="btn-secondary">
                Importeren uit Excel
              </Link>
            )}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- download (CSV), geen pagina */}
            <a href="/wetgeving/vestigingen/export" className="btn-secondary">
              Exporteren (CSV)
            </a>
          </>
        }
      />
      <LegalNav />

      {canEdit && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <Disclosure summary="Audit plannen voor één vestiging">
            {questionCount === 0 ? (
              <p className="text-sm text-neutral-600">
                Vul eerst de <Link href="/wetgeving/vestigingen/vragen">auditvragen</Link> (of importeer het tabblad Compliance-audit).
              </p>
            ) : (
              <Form action={createLocationAudit} className="grid gap-3 md:grid-cols-2">
                <Field label="Vestiging">
                  <Select name="locationId" options={lookups.locations} placeholder="— Kies —" />
                </Field>
                <Field label="Datum audit">
                  <input name="date" type="date" required defaultValue={toDateInput(new Date())} className="input" />
                </Field>
                <Field label="Auditor (gebruiker)" hint="Mag de checklist invullen">
                  <Select name="auditorId" options={lookups.users} placeholder="— Geen —" />
                </Field>
                <Field label="Of auditor (naam)">
                  <input name="auditorText" maxLength={200} className="input" />
                </Field>
                <div className="md:col-span-2">
                  <SubmitButton>Audit plannen ({questionCount} vragen)</SubmitButton>
                </div>
              </Form>
            )}
          </Disclosure>
          <Disclosure summary="Audit plannen voor alle vestigingen">
            <Form action={createAuditsForAllLocations} className="grid gap-3 md:grid-cols-2">
              <p className="text-sm text-neutral-600 md:col-span-2">
                Maakt per actieve vestiging een audit aan, behalve waar al een geplande of lopende audit is.
              </p>
              <Field label="Datum audit">
                <input name="date" type="date" required defaultValue={toDateInput(new Date())} className="input" />
              </Field>
              <Field label="Auditor (gebruiker)">
                <Select name="auditorId" options={lookups.users} placeholder="— Geen —" />
              </Field>
              <div className="md:col-span-2">
                <SubmitButton>Plannen</SubmitButton>
              </div>
            </Form>
          </Disclosure>
        </div>
      )}

      <section className="card mb-6">
        <h2 className="mb-3">Stand per vestiging</h2>
        {locations.length === 0 ? (
          <EmptyState>Nog geen vestigingen. Voeg ze toe onder Stamgegevens.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Vestiging</th>
                  <th>Laatste audit</th>
                  <th>Status</th>
                  <th className="text-right">Vragen</th>
                  <th className="text-right">Beoordeeld</th>
                  <th className="text-right">Voldoet</th>
                  <th className="text-right">Deels</th>
                  <th className="text-right">Voldoet niet</th>
                  <th className="text-right">N.v.t.</th>
                  <th>Score</th>
                  <th className="text-center">Open acties</th>
                  <th>Laatst afgerond</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((l) => {
                  const a = latestByLocation.get(l.id);
                  const s = a ? locationAuditScore(a.answers.map((x) => x.verdict)) : null;
                  const open = openByLocation.get(l.id) ?? 0;
                  return (
                    <tr key={l.id}>
                      <td>
                        <div className="font-medium">{l.name}</div>
                        {l.city && <div className="text-xs text-neutral-500">{l.city}</div>}
                      </td>
                      <td className="whitespace-nowrap">
                        {a ? (
                          <Link href={`/wetgeving/vestigingen/${a.id}`}>
                            {locationAuditCode(a.number)} · {formatDate(a.date)}
                          </Link>
                        ) : (
                          <span className="text-neutral-400">Nog niet geaudit</span>
                        )}
                      </td>
                      <td>{a && <Badge className={AUDIT_STATUS_CLASS[a.status]}>{AUDIT_STATUS_LABEL[a.status]}</Badge>}</td>
                      <td className="text-right tabular-nums">{s?.total ?? "—"}</td>
                      <td className="text-right tabular-nums">{s?.assessed ?? "—"}</td>
                      <td className="text-right tabular-nums">{s?.compliant ?? "—"}</td>
                      <td className="text-right tabular-nums">{s?.partial ?? "—"}</td>
                      <td className={`text-right tabular-nums ${s?.nonCompliant ? "font-semibold text-brand-red" : ""}`}>{s?.nonCompliant ?? "—"}</td>
                      <td className="text-right tabular-nums">{s?.notApplicable ?? "—"}</td>
                      <td>{s && <Badge className={SCORE_BAND_CLASS[scoreBand(s.pct)]}>{pctText(s.pct)}</Badge>}</td>
                      <td className={`text-center tabular-nums ${open ? "font-semibold" : "text-neutral-400"}`}>{open}</td>
                      <td className="whitespace-nowrap">{formatDate(lastCompleted.get(l.id) ?? null)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="mb-3">Alle audits</h2>
        {audits.length === 0 ? (
          <EmptyState>Nog geen audits gepland.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Vestiging</th>
                  <th>Datum</th>
                  <th>Auditor</th>
                  <th>Status</th>
                  <th>Voortgang</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {audits.map((a) => {
                  const s = locationAuditScore(a.answers.map((x) => x.verdict));
                  return (
                    <tr key={a.id} className={a.status === "CANCELLED" ? "opacity-50" : ""}>
                      <td className="font-mono text-xs">
                        <Link href={`/wetgeving/vestigingen/${a.id}`}>{locationAuditCode(a.number)}</Link>
                      </td>
                      <td>{a.location.name}</td>
                      <td className="whitespace-nowrap">{formatDate(a.date)}</td>
                      <td>{a.auditor?.name ?? a.auditorText ?? "—"}</td>
                      <td>
                        <Badge className={AUDIT_STATUS_CLASS[a.status]}>{AUDIT_STATUS_LABEL[a.status]}</Badge>
                      </td>
                      <td className="tabular-nums">
                        {s.assessed}/{s.total}
                      </td>
                      <td>
                        <Badge className={SCORE_BAND_CLASS[scoreBand(s.pct)]}>{pctText(s.pct)}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
