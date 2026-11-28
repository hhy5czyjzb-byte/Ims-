import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { getLookups } from "@/lib/lookups";
import { carrierGroup, formatQuantity, formatTonnes, groupKg, PERIOD_PARTS, type PeriodPart, formatPct } from "@/lib/co2";
import { latestDataYear, loadFactors, loadFootprint, targetStatus } from "@/lib/co2-data";
import { SCOPE_LABEL } from "@/lib/labels";
import { ChartCard } from "@/components/charts";
import { GroupDonut } from "@/components/co2-charts";
import { Badge, EmptyState, Field, PageHeader, ProgressBar, Select } from "@/components/ui";
import { Co2Nav } from "@/components/co2-nav";

export const metadata = { title: "CO2-footprint" };

type Search = { jaar?: string; deel?: string; discipline?: string; locatie?: string };
// Zelfde kleuren als de grafieken elders (SERIES: blauw, oranje, aqua); rood blijft voor status.
const SCOPE_COLOR: Record<1 | 2 | 3, string> = { 1: "bg-[#257de0]", 2: "bg-[#f47230]", 3: "bg-[#00b894]" };

export default async function Co2Page({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const currentYear = new Date().getUTCFullYear();
  const year = Number(sp.jaar) >= 2000 && Number(sp.jaar) <= 2100 ? Number(sp.jaar) : await latestDataYear();
  const part = (PERIOD_PARTS.some((p) => p.value === sp.deel) ? sp.deel : "jaar") as PeriodPart;
  const filter = { disciplineId: sp.discipline || undefined, locationId: sp.locatie || undefined };

  const factors = await loadFactors();
  const [fp, prev, lookups, carriers, targets, aspectCount, years] = await Promise.all([
    loadFootprint(year, part, filter, factors),
    loadFootprint(year - 1, part, filter, factors),
    getLookups(),
    prisma.energyCarrier.findMany({ select: { id: true, name: true, unit: true } }),
    prisma.reductionTarget.findMany({ where: { active: true }, orderBy: { targetYear: "asc" } }),
    prisma.environmentalAspect.count({ where: { active: true, co2Relevant: true } }),
    Promise.all(Array.from({ length: 5 }, (_, i) => currentYear - 4 + i).map(async (y) => ({ y, fp: await loadFootprint(y, "jaar", filter, factors) }))),
  ]);
  const targetRows = await Promise.all(targets.map(async (t) => ({ t, s: await targetStatus(t, factors) })));

  const carrierById = new Map(carriers.map((c) => [c.id, c]));
  // Alleen energiedragers die in deze periode verbruik hebben zonder geldige factor.
  const noFactor = [...new Set(fp.rows.filter((r) => r.kg === null).map((r) => r.carrierId))].map((id) => carrierById.get(id)!).filter(Boolean);
  const byCarrier = groupKg(fp.rows, (r) => r.carrierId);
  const byDiscipline = groupKg(fp.rows, (r) => r.c.discipline?.name ?? "Bedrijfsbreed");
  const byLocation = groupKg(fp.rows, (r) => r.c.location?.name ?? "Alle locaties / onbekend");
  const byEquipment = groupKg(
    fp.rows.filter((r) => r.c.equipment),
    (r) => (r.c.equipment!.code ? `${r.c.equipment!.name} (${r.c.equipment!.code})` : r.c.equipment!.name),
  ).slice(0, 10);
  const maxYear = Math.max(1, ...years.map((y) => y.fp.totalKg));
  const partial = year === currentYear;
  const exportQuery = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  const change = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null);

  return (
    <>
      <PageHeader
        title="CO2-prestatieladder"
        description="Footprint per scope op basis van het vastgelegde energie- en brandstofverbruik en de emissiefactoren die golden in de verbruiksperiode."
        actions={
          <>
            {can(user.role, "co2.manage") && (
              <Link href="/co2/import" className="btn-secondary">
                Verbruik importeren
              </Link>
            )}
            <a href={`/co2/export${exportQuery ? `?${exportQuery}` : ""}`} className="btn-secondary">
              Exporteren (CSV)
            </a>
          </>
        }
      />
      <Co2Nav />

      <form className="mb-4 flex flex-wrap items-end gap-2">
        <Field label="Jaar">
          <select name="jaar" defaultValue={String(year)} className="input">
            {Array.from({ length: 8 }, (_, i) => currentYear - 6 + i).map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </Field>
        <Field label="Periode">
          <Select name="deel" options={PERIOD_PARTS} defaultValue={part} />
        </Field>
        <Field label="Discipline">
          <Select name="discipline" options={lookups.disciplines} defaultValue={sp.discipline} placeholder="Alle" />
        </Field>
        <Field label="Locatie">
          <Select name="locatie" options={lookups.locations} defaultValue={sp.locatie} placeholder="Alle" />
        </Field>
        <button className="btn-secondary">Tonen</button>
      </form>

      {(fp.missingFactor > 0 || noFactor.length > 0) && (
        <div role="alert" className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {fp.missingFactor > 0 && <>{fp.missingFactor} verbruiksregel(s) in deze periode hebben geen geldige emissiefactor en tellen niet mee. </>}
          {noFactor.length > 0 && <>Zonder emissiefactor: {noFactor.map((c) => c.name).join(", ")}. </>}
          <Link href="/co2/factoren">Emissiefactoren beheren →</Link>
        </div>
      )}

      {fp.rows.length === 0 ? (
        <EmptyState>
          Nog geen verbruik vastgelegd voor {fp.range.label}. <Link href="/co2/verbruik">Verbruik invoeren</Link>
          {can(user.role, "co2.manage") && (
            <>
              {" "}
              of <Link href="/co2/import">importeren uit Excel</Link>
            </>
          )}
          .
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {([1, 2, 3] as const).map((s) => {
              const ch = change(fp.byScope[s], prev.byScope[s]);
              return (
                <div key={s} className="card">
                  <div className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">{s === 3 ? "Zakelijk reizen" : `Scope ${s}`}</div>
                  <div className="mt-1 text-3xl font-bold tabular-nums">{formatTonnes(fp.byScope[s])}</div>
                  <div className="mt-1 text-xs text-neutral-500">
                    CO2e ·{" "}
                    {ch === null ? (
                      "geen vergelijking"
                    ) : (
                      <span className={ch <= 0 ? "text-green-700" : "text-brand-red"}>{`${formatPct(ch, true)} t.o.v. ${year - 1}`}</span>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="card border-brand-red/40">
              <div className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Totaal {fp.range.label}</div>
              <div className="mt-1 text-3xl font-bold text-brand-red tabular-nums">{formatTonnes(fp.totalKg)}</div>
              <div className="mt-1 text-xs text-neutral-500">
                {(() => {
                  const ch = change(fp.totalKg, prev.totalKg);
                  return ch === null ? "geen vergelijking" : `${formatPct(ch, true)} t.o.v. ${year - 1}`;
                })()}
                {partial && " · lopend jaar, nog niet compleet"}
              </div>
            </div>
          </div>

          <div className="card mt-4">
            <div className="mb-2 flex h-4 overflow-hidden rounded-full bg-neutral-100" role="img" aria-label="Verdeling over scopes">
              {([1, 2, 3] as const).map((s) => (
                <div
                  key={s}
                  className={SCOPE_COLOR[s]}
                  style={{ width: `${fp.totalKg ? (fp.byScope[s] / fp.totalKg) * 100 : 0}%` }}
                  title={s === 3 ? "Zakelijk reizen" : `Scope ${s}`}
                />
              ))}
            </div>
            <ul className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-600">
              {([1, 2, 3] as const).map((s) => (
                <li key={s} className="flex items-center gap-1.5">
                  <span className={`inline-block h-2.5 w-2.5 rounded-sm ${SCOPE_COLOR[s]}`} />
                  {SCOPE_LABEL[s]} — {fp.totalKg ? Math.round((fp.byScope[s] / fp.totalKg) * 100) : 0} %
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <ChartCard title={`CO2-footprint ${fp.range.label}`} subtitle="t CO2 per groep (zoals in het CO2-jaarverslag)">
              <GroupDonut
                items={fp.rows.map((r) => ({ group: carrierGroup(r.c.carrier), value: (r.kg ?? 0) / 1000 }))}
                unit=" t"
                centerLabel="t CO2"
                decimals={1}
              />
            </ChartCard>
            <ChartCard title={`Energiebalans ${fp.range.label}`} subtitle="GJ per groep">
              <GroupDonut
                items={fp.rows.map((r) => ({
                  group: carrierGroup(r.c.carrier),
                  value: r.c.carrier.energyPerUnit === null ? 0 : r.quantity * Number(r.c.carrier.energyPerUnit),
                }))}
                unit=" GJ"
                centerLabel="GJ"
              />
            </ChartCard>
          </div>
          <Link
            href={`/co2/rapportage?jaar=${year}`}
            className="mt-4 flex items-center justify-between gap-4 rounded-xl bg-neutral-900 px-5 py-4 text-white no-underline hover:no-underline print:hidden"
          >
            <span>
              <span className="block text-xs font-semibold tracking-widest text-white/70 uppercase">Rapportage</span>
              <span className="text-lg font-semibold">CO2-jaarverslag {year} bekijken, afdrukken of als Word downloaden</span>
            </span>
            <span className="rounded-full bg-brand-red px-4 py-2 text-sm font-semibold">Openen →</span>
          </Link>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section className="card">
              <h2 className="mb-3">Per energiedrager</h2>
              <table className="table">
                <thead>
                  <tr>
                    <th>Energiedrager</th>
                    <th className="text-right">Verbruik</th>
                    <th className="text-right">CO2e</th>
                    <th className="text-right">Aandeel</th>
                  </tr>
                </thead>
                <tbody>
                  {byCarrier.map((g) => {
                    const c = carrierById.get(g.key);
                    return (
                      <tr key={g.key}>
                        <td>{c?.name ?? "?"}</td>
                        <td className="text-right whitespace-nowrap tabular-nums">
                          {formatQuantity(g.quantity)} {c?.unit}
                        </td>
                        <td className="text-right whitespace-nowrap tabular-nums">{formatTonnes(g.kg)}</td>
                        <td className="text-right tabular-nums">{fp.totalKg ? Math.round((g.kg / fp.totalKg) * 100) : 0} %</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
            <section className="card">
              <h2 className="mb-3">Verloop per jaar</h2>
              <ul className="space-y-2 text-sm">
                {years.map(({ y, fp: f }) => (
                  <li key={y} className="flex items-center gap-2">
                    <Link href={`/co2?jaar=${y}`} className="w-12">
                      {y}
                    </Link>
                    <span className="h-3 flex-1 overflow-hidden rounded bg-neutral-100">
                      <span className="flex h-full">
                        {([1, 2, 3] as const).map((s) => (
                          <span key={s} className={SCOPE_COLOR[s]} style={{ width: `${(f.byScope[s] / maxYear) * 100}%` }} />
                        ))}
                      </span>
                    </span>
                    <span className="w-20 text-right tabular-nums">{formatTonnes(f.totalKg)}</span>
                    {y === currentYear && <span className="text-xs text-neutral-400">lopend</span>}
                  </li>
                ))}
              </ul>
            </section>
            <GroupTable title="Per discipline" rows={byDiscipline} total={fp.totalKg} />
            <GroupTable title="Per locatie" rows={byLocation} total={fp.totalKg} />
            {byEquipment.length > 0 && <GroupTable title="Materieel (top 10)" rows={byEquipment} total={fp.totalKg} />}
          </div>
        </>
      )}

      <section className="card mt-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2>Reductiedoelstellingen</h2>
          <Link href="/co2/doelstellingen" className="text-sm">
            Alle doelstellingen →
          </Link>
        </div>
        {targetRows.length === 0 ? (
          <p className="text-sm text-neutral-500">Nog geen doelstellingen vastgelegd.</p>
        ) : (
          <table className="table">
            <tbody>
              {targetRows.map(({ t, s }) => (
                <tr key={t.id}>
                  <td>
                    <Link href={`/co2/doelstellingen/${t.id}`}>{t.title}</Link>
                    <div className="text-xs text-neutral-500">
                      −{Number(t.reductionPct)} % in {t.targetYear} t.o.v. {t.baseYear} · {t.scope ? `scope ${t.scope}` : "totaal"}
                    </div>
                  </td>
                  <td className="w-64">
                    {s.latestFull ? (
                      <>
                        <ProgressBar
                          value={Number(t.reductionPct) > 0 ? (Math.max(0, s.latestFull.actualPct) / Number(t.reductionPct)) * 100 : 0}
                          tone={s.latestFull.onTrack ? "good" : "bad"}
                        />
                        <div className="text-xs text-neutral-500">
                          {s.latestFull.year}: {formatPct(s.latestFull.actualPct)} gereduceerd (pad: {formatPct(s.latestFull.plannedPct)})
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-neutral-400">Nog geen volledig jaar na het basisjaar</span>
                    )}
                  </td>
                  <td>
                    {s.latestFull?.onTrack === true && <Badge className="bg-green-100 text-green-800">Op koers</Badge>}
                    {s.latestFull?.onTrack === false && <Badge className="bg-red-100 text-brand-red-dark">Achter op schema</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {aspectCount > 0 && (
        <p className="mt-4 text-sm text-neutral-600">
          <Link href="/milieuaspecten?co2=ja">{aspectCount} milieuaspect(en)</Link> zijn gemarkeerd als relevant voor de CO2-prestatieladder.
        </p>
      )}
    </>
  );
}

function GroupTable({ title, rows, total }: { title: string; rows: { key: string; kg: number }[]; total: number }) {
  return (
    <section className="card">
      <h2 className="mb-3">{title}</h2>
      <ul className="space-y-1.5 text-sm">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2">
            <span className="w-40 shrink-0 truncate" title={r.key}>
              {r.key}
            </span>
            <span className="h-2.5 flex-1 overflow-hidden rounded bg-neutral-100">
              <span className="block h-full rounded bg-[#257de0]" style={{ width: `${total ? (r.kg / total) * 100 : 0}%` }} />
            </span>
            <span className="w-20 text-right tabular-nums">{formatTonnes(r.kg)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
