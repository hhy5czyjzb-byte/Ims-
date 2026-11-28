import { Fragment } from "react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { EMISSION_TYPE_LABEL, targetProgress } from "@/lib/co2";
import { getMainTarget, loadProgress } from "@/lib/co2-data";
import { PageHeader } from "@/components/ui";
import { ChartCard, Columns } from "@/components/charts";
import { Co2Nav } from "@/components/co2-nav";

export const metadata = { title: "CO2-voortgang" };

const t1 = (kg: number) => (kg / 1000).toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default async function ProgressPage({ searchParams }: { searchParams: Promise<{ van?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const first = await prisma.energyConsumption.findFirst({ orderBy: { periodStart: "asc" }, select: { periodStart: true } });
  const now = new Date().getUTCFullYear();
  const firstYear = first?.periodStart.getUTCFullYear() ?? now;
  const from = Math.max(firstYear, Number(sp.van) || now - 6);
  // Het lopende jaar alleen tonen als er al verbruik is.
  const data = (await loadProgress(from, now)).filter((d) => d.year < now || d.lines.length > 0);
  const target = await getMainTarget();
  const type = data[0]?.type ?? "WTW";

  // Alle emissiestromen over de jaren.
  const streams = new Map<string, { name: string; scope: 1 | 2 | 3; unit: string }>();
  for (const y of data) for (const l of y.lines) streams.set(`${l.carrierId}|${l.scope}`, { name: l.name, scope: l.scope, unit: l.unit });
  const rows = [...streams.entries()].sort((a, b) => a[1].scope - b[1].scope || a[1].name.localeCompare(b[1].name, "nl"));
  const kgOf = (y: (typeof data)[number], k: string) => y.lines.find((l) => `${l.carrierId}|${l.scope}` === k)?.kg ?? 0;
  const baseInv = target ? data.find((d) => d.year === target.baseYear) : null;
  const baseKg = target?.baselineKg ? Number(target.baselineKg) : (baseInv?.totalKg ?? 0);

  return (
    <>
      <PageHeader
        title="CO2-prestatieladder"
        description={`Voortgang van de jaarlijkse CO2-emissies per emissiestroom (heel jaar, ${EMISSION_TYPE_LABEL[type]}). Het lopende jaar is nog niet compleet.`}
      />
      <Co2Nav />
      <form className="mb-4 flex items-end gap-2 print:hidden">
        <label className="block">
          <span className="label">Vanaf jaar</span>
          <select name="van" defaultValue={from} className="input">
            {Array.from({ length: now - firstYear + 1 }, (_, i) => firstYear + i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-secondary">Tonen</button>
      </form>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <ChartCard title="Uitstoot per jaar" subtitle="t CO2, per scope" className="lg:col-span-2">
          <Columns
            periods={data.map((d) => ({ label: String(d.year), title: d.year === now ? `${d.year} (onvolledig)` : String(d.year) }))}
            series={[
              { name: "Scope 1", values: data.map((d) => Math.round(d.byScope[1] / 1000)) },
              { name: "Scope 2", values: data.map((d) => Math.round(d.byScope[2] / 1000)) },
              { name: "Zakelijk reizen", values: data.map((d) => Math.round(d.byScope[3] / 1000)) },
            ]}
          />
        </ChartCard>
        <ChartCard title="Doelstelling" subtitle={target ? `${target.title}` : "Nog geen doelstelling voor de hele organisatie"}>
          {target && baseKg > 0 ? (
            <ul className="space-y-1 text-sm">
              {data
                .filter((d) => d.year >= target.baseYear && d.lines.length > 0)
                .map((d) => {
                  const p = targetProgress({
                    baseKg,
                    currentKg: d.totalKg,
                    reductionPct: Number(target.reductionPct),
                    baseYear: target.baseYear,
                    targetYear: target.targetYear,
                    year: d.year,
                  });
                  const complete = d.year < now;
                  return (
                    <li key={d.year} className="flex justify-between gap-2">
                      <span>
                        {d.year}
                        {!complete && " (onvolledig)"}
                      </span>
                      <span className={`tabular-nums ${complete ? (p.onTrack ? "text-green-700" : "text-brand-red") : "text-neutral-500"}`}>
                        {p.actualPct.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}% (pad{" "}
                        {p.plannedPct.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%)
                      </span>
                    </li>
                  );
                })}
              <li className="pt-1 text-xs text-neutral-500">
                Basisjaar {target.baseYear}: {t1(baseKg)} t · doel {Number(target.reductionPct).toLocaleString("nl-NL")}% in {target.targetYear}
              </li>
            </ul>
          ) : (
            <p className="text-sm text-neutral-500">Leg een doelstelling vast (tabblad Doelstellingen) of lees het plan van aanpak in.</p>
          )}
        </ChartCard>
      </div>

      <section className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Emissiestroom (t CO2)</th>
              {data.map((d) => (
                <th key={d.year} className="text-right">
                  {d.year}
                  {d.year === now && "*"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {([1, 2, 3] as const).map((s) => (
              <Fragment key={s}>
                {rows
                  .filter(([, v]) => v.scope === s)
                  .map(([k, v]) => (
                    <tr key={k}>
                      <td>{v.name}</td>
                      {data.map((d) => (
                        <td key={d.year} className="text-right tabular-nums">
                          {t1(kgOf(d, k))}
                        </td>
                      ))}
                    </tr>
                  ))}
                <tr className="bg-neutral-50 font-semibold">
                  <td>Totaal {s === 3 ? "zakelijk reizen" : `scope ${s}`}</td>
                  {data.map((d) => (
                    <td key={d.year} className="text-right tabular-nums">
                      {t1(d.byScope[s])}
                    </td>
                  ))}
                </tr>
              </Fragment>
            ))}
            <tr className="bg-neutral-100 font-bold">
              <td>Totaal</td>
              {data.map((d) => (
                <td key={d.year} className="text-right tabular-nums">
                  {t1(d.totalKg)}
                </td>
              ))}
            </tr>
            <tr>
              <td className="text-neutral-600">Aantal FTE</td>
              {data.map((d) => (
                <td key={d.year} className="text-right tabular-nums text-neutral-600">
                  {d.fte?.toLocaleString("nl-NL") ?? "—"}
                </td>
              ))}
            </tr>
            <tr>
              <td className="text-neutral-600">t CO2 per FTE</td>
              {data.map((d) => (
                <td key={d.year} className="text-right tabular-nums text-neutral-600">
                  {d.fte ? (d.totalKg / 1000 / d.fte).toLocaleString("nl-NL", { maximumFractionDigits: 2 }) : "—"}
                </td>
              ))}
            </tr>
            <tr>
              <td className="text-neutral-600">Verandering t.o.v. vorig jaar</td>
              {data.map((d, i) => (
                <td key={d.year} className="text-right tabular-nums text-neutral-600">
                  {i > 0 && data[i - 1].totalKg > 0 && d.totalKg > 0
                    ? `${(((d.totalKg - data[i - 1].totalKg) / data[i - 1].totalKg) * 100).toLocaleString("nl-NL", { maximumFractionDigits: 1, signDisplay: "always" })}%`
                    : "—"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </section>
      <p className="mt-2 text-xs text-neutral-500">* lopend jaar, nog niet compleet.</p>
    </>
  );
}
