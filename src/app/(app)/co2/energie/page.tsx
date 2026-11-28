import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { carrierGroup, formatQuantity, overlapFraction } from "@/lib/co2";
import { latestDataYear, loadInventory, loadProgress } from "@/lib/co2-data";
import { PageHeader } from "@/components/ui";
import { ChartCard, Columns } from "@/components/charts";
import { FuelPerYear, GroupDonut } from "@/components/co2-charts";
import { fuelSummary } from "@/lib/co2-report";
import { Co2Nav } from "@/components/co2-nav";
import { Co2Filters, yearList } from "@/components/co2-filters";

export const metadata = { title: "Energie" };

const KWH_PER_GJ = 277.7777778;

export default async function EnergyPage({ searchParams }: { searchParams: Promise<{ jaar?: string; eenheid?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const unit = sp.eenheid === "kWh" ? "kWh" : "GJ";
  const conv = (gj: number) => (unit === "GJ" ? gj : gj * KWH_PER_GJ);
  const fmt = (gj: number) => Math.round(conv(gj)).toLocaleString("nl-NL");
  const first = await prisma.energyConsumption.findFirst({ orderBy: { periodStart: "asc" }, select: { periodStart: true } });
  const years = yearList(first?.periodStart.getUTCFullYear() ?? null);
  const now = new Date().getUTCFullYear();
  const year = Number(sp.jaar) >= 2000 && Number(sp.jaar) <= 2100 ? Number(sp.jaar) : await latestDataYear();
  const [inv, allProgress] = await Promise.all([loadInventory(year), loadProgress(Math.max(years[years.length - 1] ?? now, now - 5), now)]);
  const progress = allProgress.filter((d) => d.year < now || d.lines.length > 0);

  // Energiebeoordeling per vestiging: elektriciteit (kWh) en aardgas (m3) per jaar.
  const bYears = [year - 3, year - 2, year - 1, year].filter((y) => y >= (years[years.length - 1] ?? y));
  const cons = await prisma.energyConsumption.findMany({
    where: { periodStart: { lt: new Date(Date.UTC(year + 1, 0, 1)) }, periodEnd: { gte: new Date(Date.UTC(bYears[0], 0, 1)) } },
    include: {
      carrier: { select: { name: true, unit: true, defaultScope: true, reportGroup: true } },
      location: { select: { name: true } },
      organisation: { select: { boundaryPct: true } },
    },
  });
  const per = (pred: (g: string) => boolean) => {
    const map = new Map<string, number[]>();
    for (const c of cons) {
      const g = carrierGroup(c.carrier);
      if (!pred(g)) continue;
      const place = c.location?.name ?? c.locationText ?? "Onbekend / totaal";
      const arr = map.get(place) ?? bYears.map(() => 0);
      bYears.forEach((y, i) => {
        arr[i] +=
          Number(c.quantity) *
          overlapFraction(c.periodStart, c.periodEnd, new Date(Date.UTC(y, 0, 1)), new Date(Date.UTC(y + 1, 0, 1))) *
          (c.organisation ? Number(c.organisation.boundaryPct) / 100 : 1);
      });
      map.set(place, arr);
    }
    return [...map.entries()].sort((a, b) => b[1][b[1].length - 1] - a[1][a[1].length - 1]);
  };
  const electricity = per((g) => g === "Elektriciteitsverbruik vastgoed");
  const gas = per((g) => g === "Aardgasverbruik");

  const Table = ({ title, rows, unitLabel }: { title: string; rows: [string, number[]][]; unitLabel: string }) => (
    <section className="card overflow-x-auto p-0">
      <table className="table">
        <thead>
          <tr>
            <th>
              {title} ({unitLabel})
            </th>
            {bYears.map((y) => (
              <th key={y} className="text-right">
                {y}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={bYears.length + 1} className="text-sm text-neutral-500">
                Geen verbruik per vestiging vastgelegd.
              </td>
            </tr>
          )}
          {rows.map(([place, v]) => (
            <tr key={place}>
              <td>{place}</td>
              {v.map((x, i) => (
                <td key={i} className="text-right tabular-nums">
                  {formatQuantity(Math.round(x))}
                </td>
              ))}
            </tr>
          ))}
          {rows.length > 0 && (
            <tr className="bg-neutral-50 font-semibold">
              <td>Totaal</td>
              {bYears.map((_, i) => (
                <td key={i} className="text-right tabular-nums">
                  {formatQuantity(Math.round(rows.reduce((n, [, v]) => n + v[i], 0)))}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );

  const noConv = inv.lines.filter((l) => l.gj === null);
  return (
    <>
      <PageHeader
        title="CO2-prestatieladder"
        description={`Energiebalans ${year} en energiebeoordeling per vestiging. Energie = verbruik × conversiefactor (GJ per eenheid), aanpasbaar bij Emissiefactoren.`}
      />
      <Co2Nav />
      <Co2Filters action="/co2/energie" year={year} years={years} showPart={false} showType={false} showUnit unit={unit} />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <ChartCard title="Energieverbruik per jaar" subtitle={`${unit}, per scope`} className="lg:col-span-2">
          <Columns
            periods={progress.map((d) => ({ label: String(d.year), title: d.year === now ? `${d.year} (onvolledig)` : String(d.year) }))}
            series={[
              { name: "Scope 1", values: progress.map((d) => Math.round(conv(d.energyByScope[1]))) },
              { name: "Scope 2", values: progress.map((d) => Math.round(conv(d.energyByScope[2]))) },
            ]}
          />
        </ChartCard>
        <ChartCard title={`Energiebalans ${year}`} subtitle={`${unit} per groep (figuur M2)`}>
          <GroupDonut items={inv.lines.map((l) => ({ group: l.group, value: conv(l.gj ?? 0) }))} unit={` ${unit}`} centerLabel={unit} />
        </ChartCard>
      </div>
      <ChartCard title="Brandstofverbruik per jaar" subtitle="liter per energiedrager (zoals in het CO2-jaarverslag)" className="mb-6">
        <FuelPerYear
          {...fuelSummary(
            progress.map((p) => ({ year: p.year, lines: p.lines })),
            year,
          )}
        />
      </ChartCard>

      <section className="card mb-6 overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Energiebalans {year}</th>
              <th className="text-right">Aantal</th>
              <th>Eenheid</th>
              <th className="text-right">Conversie (GJ/eenheid)</th>
              <th className="text-right">{unit}</th>
              <th className="text-right">Aandeel</th>
            </tr>
          </thead>
          <tbody>
            {([1, 2] as const).map((s) =>
              inv.lines
                .filter((l) => l.scope === s)
                .map((l) => (
                  <tr key={`${l.carrierId}-${s}`}>
                    <td>
                      {l.name} <span className="text-xs text-neutral-500">scope {s}</span>
                    </td>
                    <td className="text-right tabular-nums">{formatQuantity(l.quantity)}</td>
                    <td>{l.unit}</td>
                    <td className="text-right tabular-nums">
                      {l.gj === null ? (
                        <span className="text-brand-red">ontbreekt</span>
                      ) : l.quantity ? (
                        (l.gj / l.quantity).toLocaleString("nl-NL", { maximumFractionDigits: 5 })
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-right tabular-nums">{l.gj === null ? "—" : fmt(l.gj)}</td>
                    <td className="text-right tabular-nums">
                      {l.gj && inv.energyTotalGJ ? `${((l.gj / inv.energyTotalGJ) * 100).toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%` : "—"}
                    </td>
                  </tr>
                )),
            )}
            <tr className="bg-neutral-50 font-semibold">
              <td colSpan={4} className="text-right">
                Totaal energieverbruik
              </td>
              <td className="text-right tabular-nums">{fmt(inv.energyTotalGJ)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </section>
      {noConv.length > 0 && <p className="mb-6 text-xs text-amber-800">Zonder conversiefactor (telt niet mee): {noConv.map((l) => l.name).join(", ")}.</p>}

      <h2 className="mb-3">Energiebeoordeling per vestiging</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <Table title="Elektriciteit (vastgoed)" rows={electricity} unitLabel="kWh" />
        <Table title="Aardgas" rows={gas} unitLabel="m3" />
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        Per vestiging uit de verbruiksregels (vestiging of vestigingstekst uit het dashboard). De grootste verbruikers staan bovenaan.
      </p>
    </>
  );
}
