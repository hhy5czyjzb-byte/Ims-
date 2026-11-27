import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { can } from "@/lib/rbac";
import { getLookups } from "@/lib/lookups";
import { formatKg, formatTonnes, formatPct } from "@/lib/co2";
import { targetStatus } from "@/lib/co2-data";
import { formatDate, isOverdue } from "@/lib/format";
import { ACTION_PRIORITY_LABEL, ACTION_STATUS_CLASS, ACTION_STATUS_LABEL, options } from "@/lib/labels";
import { Badge, Disclosure, Field, PageHeader, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { Co2Nav } from "@/components/co2-nav";
import { TargetForm } from "@/components/target-form";
import { createMeasure, deleteTarget, updateTarget } from "../../actions";

export default async function TargetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const t = await prisma.reductionTarget.findUnique({
    where: { id },
    include: { discipline: true, measures: { orderBy: { number: "desc" }, include: { owner: { select: { name: true } } } } },
  });
  if (!t) notFound();
  await logAudit({ user, action: "VIEW", entityType: "ReductionTarget", entityId: id });
  const [s, lookups] = await Promise.all([targetStatus(t), getLookups()]);
  const pct = Number(t.reductionPct);
  const targetKg = s.baseKg * (1 - pct / 100);
  const expected = t.measures.filter((m) => m.status !== "CANCELLED").reduce((sum, m) => sum + Number(m.expectedReductionKg ?? 0), 0);
  const maxKg = Math.max(1, s.baseKg, ...s.years.map((y) => y.kg));

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/co2", label: "CO2" },
          { href: "/co2/doelstellingen", label: "Doelstellingen" },
        ]}
        title={t.title}
        description={t.description ?? undefined}
      />
      <Co2Nav />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`Basisjaar ${t.baseYear}`} value={formatTonnes(s.baseKg)} hint={s.baseFromData ? "berekend uit verbruik" : "handmatig ingevoerd"} />
        <Stat
          label={`Doel ${t.targetYear}`}
          value={formatTonnes(targetKg)}
          hint={`−${pct} % · ${t.scope ? `scope ${t.scope}` : "alle scopes"} · ${t.discipline?.name ?? "bedrijfsbreed"}`}
        />
        <Stat
          label={s.latestFull ? `Laatste volledige jaar (${s.latestFull.year})` : "Laatste volledige jaar"}
          value={s.latestFull ? formatTonnes(s.latestFull.kg) : "—"}
          hint={s.latestFull ? `${formatPct(s.latestFull.actualPct)} gereduceerd; pad ${formatPct(s.latestFull.plannedPct)}` : "nog niet beschikbaar"}
          tone={s.latestFull?.onTrack === false ? "alert" : s.latestFull?.onTrack ? "ok" : undefined}
        />
        <Stat
          label="Verwachte reductie maatregelen"
          value={formatTonnes(expected)}
          hint={`nodig: ${formatTonnes(Math.max(0, s.baseKg - targetKg))} per jaar t.o.v. basisjaar`}
        />
      </div>

      <section className="card mt-4">
        <h2 className="mb-3">Verloop</h2>
        {s.baseKg === 0 && (
          <p className="mb-2 text-sm text-amber-700">
            Er is geen uitstoot voor het basisjaar bekend. Leg verbruik over {t.baseYear} vast of vul de uitstoot van het basisjaar handmatig in.
          </p>
        )}
        <table className="table">
          <thead>
            <tr>
              <th>Jaar</th>
              <th className="w-1/2"></th>
              <th className="text-right">Uitstoot</th>
              <th className="text-right">Toegestaan (pad)</th>
              <th className="text-right">Reductie</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {s.years.map((y) => (
              <tr key={y.year}>
                <td>
                  <Link href={`/co2?jaar=${y.year}`}>{y.year}</Link>
                  {!y.complete && <span className="ml-1 text-xs text-neutral-400">lopend (t/m vandaag)</span>}
                </td>
                <td>
                  <div className="relative h-3 rounded bg-neutral-100">
                    <div
                      className={`h-full rounded ${!y.complete ? "bg-neutral-400" : y.onTrack === false ? "bg-brand-red" : "bg-green-600"}`}
                      style={{ width: `${(y.kg / maxKg) * 100}%` }}
                    />
                    <div
                      className="absolute top-[-3px] h-[18px] w-0.5 bg-neutral-800"
                      style={{ left: `${(y.allowedKg / maxKg) * 100}%` }}
                      title="Toegestaan volgens pad"
                    />
                  </div>
                </td>
                <td className="text-right whitespace-nowrap tabular-nums">{formatTonnes(y.kg)}</td>
                <td className="text-right whitespace-nowrap tabular-nums text-neutral-500">{formatTonnes(y.allowedKg)}</td>
                <td className="text-right tabular-nums">{y.year === t.baseYear || !y.complete ? "—" : formatPct(y.actualPct)}</td>
                <td className="text-xs">
                  {y.year === t.baseYear ? (
                    "basisjaar"
                  ) : !y.complete ? (
                    "nog niet compleet"
                  ) : y.onTrack ? (
                    <span className="text-green-700">op koers</span>
                  ) : (
                    <span className="text-brand-red">achter</span>
                  )}
                  {y.missingFactor > 0 && <div className="text-amber-700">{y.missingFactor} regel(s) zonder factor</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-neutral-500">
          Het pad loopt lineair van 0 % in {t.baseYear} naar −{pct} % in {t.targetYear}. De zwarte streep is de toegestane uitstoot in dat jaar.
        </p>
      </section>

      <section className="card mt-4">
        <h2 className="mb-3">Maatregelen</h2>
        {t.measures.length === 0 ? (
          <p className="mb-3 text-sm text-neutral-500">Nog geen maatregelen.</p>
        ) : (
          <table className="table mb-3">
            <tbody>
              {t.measures.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link href={`/acties/${m.id}`}>
                      #{m.number} {m.title}
                    </Link>
                  </td>
                  <td className="text-right whitespace-nowrap tabular-nums">
                    {m.expectedReductionKg ? `−${formatKg(Number(m.expectedReductionKg))}/jaar` : "—"}
                  </td>
                  <td className="text-neutral-600">{m.owner?.name ?? "—"}</td>
                  <td
                    className={`whitespace-nowrap ${(m.status === "OPEN" || m.status === "IN_PROGRESS") && isOverdue(m.deadline) ? "font-semibold text-brand-red" : ""}`}
                  >
                    {formatDate(m.deadline)}
                  </td>
                  <td>
                    <Badge className={ACTION_STATUS_CLASS[m.status]}>{ACTION_STATUS_LABEL[m.status]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {can(user.role, "actions.create") && (
          <Form
            resetOnSuccess
            action={createMeasure.bind(null, id)}
            className="grid gap-2 border-t border-neutral-100 pt-3 md:grid-cols-[1fr_10rem_11rem_10rem_8rem_auto] md:items-end"
          >
            <Field label="Nieuwe maatregel">
              <input name="title" required maxLength={300} className="input" placeholder="bijv. Shovels vervangen door elektrisch" />
            </Field>
            <Field label="Reductie (kg/jaar)">
              <input name="expectedReductionKg" inputMode="decimal" className="input" />
            </Field>
            <Field label="Eigenaar">
              <Select name="ownerId" options={lookups.users} placeholder="— Kies —" />
            </Field>
            <Field label="Deadline">
              <input name="deadline" type="date" className="input" />
            </Field>
            <Field label="Prioriteit">
              <Select name="priority" options={options(ACTION_PRIORITY_LABEL)} defaultValue="MEDIUM" />
            </Field>
            <SubmitButton variant="secondary">Toevoegen</SubmitButton>
          </Form>
        )}
      </section>

      {can(user.role, "co2.manage") && (
        <div className="mt-6">
          <Disclosure summary="Doelstelling wijzigen">
            <TargetForm
              key={t.updatedAt.toISOString()}
              target={t}
              formAction={updateTarget.bind(null, id)}
              disciplines={lookups.disciplines}
              submitLabel="Opslaan"
            />
            <Form action={deleteTarget.bind(null, id)} className="mt-4 border-t border-neutral-200 pt-3">
              <SubmitButton variant="link" confirm="Doelstelling verwijderen? Overweeg liever 'Actief' uit te vinken. Maatregelen blijven als acties bestaan.">
                Verwijderen
              </SubmitButton>
            </Form>
          </Disclosure>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "alert" | "ok" }) {
  return (
    <div className="card">
      <div className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${tone === "alert" ? "text-brand-red" : tone === "ok" ? "text-green-700" : ""}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-neutral-500">{hint}</div>}
    </div>
  );
}
