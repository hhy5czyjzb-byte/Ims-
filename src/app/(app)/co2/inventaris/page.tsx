import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { EMISSION_TYPE_LABEL, PERIOD_PARTS, formatQuantity, formatTonnes, type EmissionType, type PeriodPart } from "@/lib/co2";
import { loadInventory, type InventoryLine } from "@/lib/co2-data";
import { PageHeader } from "@/components/ui";
import { BarList, ChartCard, SegmentBar } from "@/components/charts";
import { Co2Nav } from "@/components/co2-nav";
import { Co2Filters, yearList } from "@/components/co2-filters";

export const metadata = { title: "CO2-emissie-inventaris" };

type Search = { jaar?: string; deel?: string; type?: string };
const t1 = (kg: number) => (kg / 1000).toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const g = (kgPerUnit: number | null) => (kgPerUnit === null ? "—" : Math.round(kgPerUnit * 1000).toLocaleString("nl-NL"));
const pct = (part: number, total: number) =>
  total > 0 ? `${((part / total) * 100).toLocaleString("nl-NL", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%` : "—";

function ScopeTable({ title, lines, total, grandTotal }: { title: string; lines: InventoryLine[]; total: number; grandTotal: number }) {
  return (
    <section className="card mb-4 overflow-x-auto p-0">
      <table className="table">
        <thead>
          <tr>
            <th>{title}</th>
            <th className="text-right">Aantal</th>
            <th>Eenheid</th>
            <th className="text-right">Factor (g CO2/eenheid)</th>
            <th className="text-right">Uitstoot (t CO2)</th>
            <th className="text-right">Aandeel</th>
            <th className="text-right">Energie (GJ)</th>
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 && (
            <tr>
              <td colSpan={7} className="text-sm text-neutral-500">
                Geen verbruik in deze periode.
              </td>
            </tr>
          )}
          {lines.map((l) => (
            <tr key={`${l.carrierId}-${l.scope}`}>
              <td>
                {l.name}
                {l.missing > 0 && <span className="ml-1 text-xs font-medium text-brand-red">geen factor</span>}
                <div className="text-xs text-neutral-500">{l.group}</div>
              </td>
              <td className="text-right tabular-nums">{formatQuantity(l.quantity)}</td>
              <td>{l.unit}</td>
              <td className="text-right tabular-nums">{g(l.factorKg)}</td>
              <td className="text-right font-medium tabular-nums">{t1(l.kg)}</td>
              <td className="text-right tabular-nums">{pct(l.kg, grandTotal)}</td>
              <td className="text-right tabular-nums">{l.gj === null ? "—" : Math.round(l.gj).toLocaleString("nl-NL")}</td>
            </tr>
          ))}
          <tr className="bg-neutral-50 font-semibold">
            <td colSpan={4} className="text-right">
              Totaal
            </td>
            <td className="text-right tabular-nums">{t1(total)}</td>
            <td className="text-right tabular-nums">{pct(total, grandTotal)}</td>
            <td className="text-right tabular-nums">{Math.round(lines.reduce((n, l) => n + (l.gj ?? 0), 0)).toLocaleString("nl-NL")}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireUser();
  const sp = await searchParams;
  const first = await prisma.energyConsumption.findFirst({ orderBy: { periodStart: "asc" }, select: { periodStart: true } });
  const years = yearList(first?.periodStart.getUTCFullYear() ?? null);
  const last = await prisma.energyConsumption.findFirst({
    where: { periodEnd: { lt: new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)) } },
    orderBy: { periodStart: "desc" },
    select: { periodStart: true },
  });
  const year = Number(sp.jaar) >= 2000 && Number(sp.jaar) <= 2100 ? Number(sp.jaar) : (last?.periodStart.getUTCFullYear() ?? new Date().getUTCFullYear() - 1);
  const part = (PERIOD_PARTS.some((p) => p.value === sp.deel) ? sp.deel : "jaar") as PeriodPart;
  const inv = await loadInventory(year, part, sp.type === "TTW" || sp.type === "WTW" ? (sp.type as EmissionType) : undefined);
  const by = (s: 1 | 2 | 3) => inv.lines.filter((l) => l.scope === s);
  const periodLabel = PERIOD_PARTS.find((p) => p.value === part)?.label ?? "Heel jaar";
  const perFte = inv.fte ? inv.totalKg / 1000 / inv.fte : null;
  const revenueM = inv.revenue ? (inv.revenue > 10_000 ? inv.revenue / 1_000_000 : inv.revenue) : null;

  return (
    <>
      <PageHeader
        title="CO2-prestatieladder"
        description={`CO2-emissie-inventaris ${year} (${periodLabel.toLowerCase()}), ${EMISSION_TYPE_LABEL[inv.type]}. Berekend uit het verbruik × de emissiefactor van dat jaar; organisaties naar hun aandeel binnen de grens.`}
      />
      <Co2Nav />
      <Co2Filters action="/co2/inventaris" year={year} part={part} type={inv.type} years={years} />

      <section className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Totaal scope 1, 2 en zakelijk reizen", t1(inv.totalKg), "t CO2"],
          ["Scope 1", t1(inv.byScope[1]), "t CO2"],
          ["Scope 2 (market based)", t1(inv.byScope[2]), "t CO2"],
          ["Zakelijk reizen", t1(inv.byScope[3]), "t CO2"],
          ["Energieverbruik", Math.round(inv.energyTotalGJ).toLocaleString("nl-NL"), "GJ"],
          [
            "Per FTE",
            perFte === null ? "—" : perFte.toLocaleString("nl-NL", { maximumFractionDigits: 2 }),
            inv.fte ? `t CO2 (${inv.fte.toLocaleString("nl-NL")} FTE)` : "geen FTE vastgelegd",
          ],
        ].map(([label, value, unit]) => (
          <div key={label} className="rounded-md border border-neutral-200 bg-white px-3 py-2">
            <div className="text-xl font-bold tabular-nums">{value}</div>
            <div className="text-xs text-neutral-500">
              {label} · {unit}
            </div>
          </div>
        ))}
      </section>

      {inv.missingFactor > 0 && (
        <p className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {inv.missingFactor} verbruiksregel(s) zonder emissiefactor voor {year}: die tellen niet mee. Voeg de factor toe bij Emissiefactoren.
        </p>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <ChartCard title="Verdeling per scope">
          <SegmentBar
            parts={[
              { label: "Scope 1", value: Math.round(inv.byScope[1] / 1000), color: "#257de0" },
              { label: "Scope 2", value: Math.round(inv.byScope[2] / 1000), color: "#f47230" },
              { label: "Zakelijk reizen", value: Math.round(inv.byScope[3] / 1000), color: "#00b894" },
            ]}
          />
        </ChartCard>
        <ChartCard title="Uitstoot per groep" subtitle="t CO2 (zoals tabel M1A in het dashboard)" className="lg:col-span-2">
          <BarList items={inv.groups.map((x) => ({ label: x.group, value: Math.round(x.kg / 1000) }))} unit=" t" />
        </ChartCard>
      </div>

      <ScopeTable title="Scope 1" lines={by(1)} total={inv.byScope[1]} grandTotal={inv.totalKg} />
      <ScopeTable title="Scope 2 — market based" lines={by(2)} total={inv.byScope[2]} grandTotal={inv.totalKg} />
      <ScopeTable title="Zakelijk reizen (business travel)" lines={by(3)} total={inv.byScope[3]} grandTotal={inv.totalKg} />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card text-sm">
          <h2 className="mb-2">Scope 2 — location based</h2>
          {inv.locationBased ? (
            <dl className="grid grid-cols-[1fr_auto] gap-y-1">
              <dt className="text-neutral-500">Elektriciteit totaal</dt>
              <dd className="tabular-nums">{formatQuantity(inv.locationBased.kwh)} kWh</dd>
              <dt className="text-neutral-500">Factor ({inv.locationBased.carrierName})</dt>
              <dd className="tabular-nums">{g(inv.locationBased.factorKg)} g/kWh</dd>
              <dt className="font-medium">Uitstoot</dt>
              <dd className="font-medium tabular-nums">{inv.locationBased.kg === null ? "geen factor" : `${t1(inv.locationBased.kg)} t`}</dd>
            </dl>
          ) : (
            <p className="text-neutral-500">Kies bij Instellingen de energiedrager voor de gridmix (location based).</p>
          )}
        </section>
        <section className="card text-sm">
          <h2 className="mb-2">Scope 3 — brandstof- en energiegerelateerd (WTT)</h2>
          <p className="text-2xl font-bold tabular-nums">{t1(inv.wttKg)} t</p>
          <p className="mt-1 text-neutral-600">
            Well-to-tank-deel van het verbruik (scope 3, categorie 3). Informatief; bij WTW is dit al in scope 1 en 2 meegenomen.
          </p>
        </section>
        <section className="card text-sm">
          <h2 className="mb-2">Biogene emissies en intensiteit</h2>
          <dl className="grid grid-cols-[1fr_auto] gap-y-1">
            <dt className="text-neutral-500">Biogene emissies</dt>
            <dd className="tabular-nums">{t1(inv.biogenicKg)} t</dd>
            <dt className="text-neutral-500">Per FTE</dt>
            <dd className="tabular-nums">{perFte === null ? "—" : `${perFte.toLocaleString("nl-NL", { maximumFractionDigits: 2 })} t`}</dd>
            <dt className="text-neutral-500">Per mln € omzet</dt>
            <dd className="tabular-nums">{revenueM ? `${(inv.totalKg / 1000 / revenueM).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} t` : "—"}</dd>
          </dl>
        </section>
      </div>
      <p className="mt-4 text-xs text-neutral-500">
        Totaal {formatTonnes(inv.totalKg)}. Factoren en GJ-conversie aanpassen bij Emissiefactoren; de inventaris rekent direct opnieuw.
      </p>
    </>
  );
}
