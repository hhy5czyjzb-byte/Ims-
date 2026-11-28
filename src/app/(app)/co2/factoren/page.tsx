import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { carrierGroup } from "@/lib/co2";
import { ENERGY_CATEGORY_LABEL, options } from "@/lib/labels";
import { Disclosure, Field, PageHeader, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { Co2Nav } from "@/components/co2-nav";
import { createCarrier } from "../actions";

export const metadata = { title: "Emissiefactoren" };

const SCOPES = [
  { value: "1", label: "Scope 1" },
  { value: "2", label: "Scope 2" },
  { value: "3", label: "Zakelijk reizen" },
];
const gram = (kg: unknown) => (kg === null || kg === undefined ? "—" : (Number(kg) * 1000).toLocaleString("nl-NL", { maximumFractionDigits: 1 }));

export default async function FactorsPage({ searchParams }: { searchParams: Promise<{ jaar?: string; alle?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const canManage = can(user.role, "co2.manage");
  const allYears = await prisma.emissionFactor.findMany({ distinct: ["validFrom"], select: { validFrom: true }, orderBy: { validFrom: "desc" } });
  const years = [...new Set(allYears.map((f) => f.validFrom.getUTCFullYear()))].sort((a, b) => b - a);
  const year = Number(sp.jaar) || years[0] || new Date().getUTCFullYear();
  const carriers = await prisma.energyCarrier.findMany({
    where: sp.alle ? {} : { OR: [{ consumptions: { some: {} } }, { active: true, factors: { none: {} } }] },
    orderBy: [{ defaultScope: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: {
      factors: { where: { validFrom: { lt: new Date(Date.UTC(year + 1, 0, 1)) } }, orderBy: { validFrom: "desc" }, take: 1 },
      _count: { select: { consumptions: true, factors: true } },
    },
  });
  const total = await prisma.energyCarrier.count();

  return (
    <>
      <PageHeader
        title="CO2-prestatieladder"
        description="Energiedragers met hun emissiefactoren per jaar (gram CO2-equivalent per eenheid: well-to-tank, tank-to-wheel, well-to-wheel en biogeen) en de energie-conversie (GJ per eenheid). Aanpassen werkt direct door in alle berekeningen."
      />
      <Co2Nav />
      <form className="mb-4 flex flex-wrap items-end gap-2 print:hidden">
        <Field label="Factoren van jaar">
          <select name="jaar" defaultValue={year} className="input">
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-1.5 pb-2 text-sm">
          <input type="checkbox" name="alle" value="1" defaultChecked={!!sp.alle} /> Ook energiedragers zonder verbruik ({total} in totaal)
        </label>
        <button className="btn-secondary">Tonen</button>
      </form>

      <section className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Energiedrager / emissiestroom</th>
              <th>Scope</th>
              <th>Eenheid</th>
              <th className="text-right">WTT</th>
              <th className="text-right">TTW</th>
              <th className="text-right">WTW</th>
              <th className="text-right">Biogeen</th>
              <th>Geldig vanaf</th>
              <th className="text-right">GJ per eenheid</th>
            </tr>
          </thead>
          <tbody>
            {carriers.map((c) => {
              const f = c.factors[0];
              const old = f && f.validFrom.getUTCFullYear() < year;
              return (
                <tr key={c.id} className={c.active ? "" : "text-neutral-400"}>
                  <td>
                    <Link href={`/co2/factoren/${c.id}`} className="font-medium">
                      {c.name}
                    </Link>
                    <div className="text-xs text-neutral-500">
                      {carrierGroup(c)} · {c._count.consumptions} verbruiksregels · {c._count.factors} factoren
                    </div>
                  </td>
                  <td>{c.defaultScope === 3 ? "BT/3" : c.defaultScope}</td>
                  <td>{c.unit}</td>
                  <td className="text-right tabular-nums">{gram(f?.wtt)}</td>
                  <td className="text-right tabular-nums">{gram(f?.ttw)}</td>
                  <td className="text-right font-medium tabular-nums">{f ? gram(f.factor) : <span className="text-brand-red">geen</span>}</td>
                  <td className="text-right tabular-nums">{gram(f?.biogenic)}</td>
                  <td className={`text-xs whitespace-nowrap ${old ? "text-amber-700" : ""}`}>
                    {f ? f.validFrom.getUTCFullYear() : "—"}
                    {old && " (oudere factor)"}
                  </td>
                  <td className="text-right tabular-nums">
                    {c.energyPerUnit === null ? (
                      <span className="text-amber-700">—</span>
                    ) : (
                      Number(c.energyPerUnit).toLocaleString("nl-NL", { maximumFractionDigits: 6 })
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <p className="mt-2 text-xs text-neutral-500">
        Factoren in gram CO2 per eenheid. Per verbruik geldt de factor van het jaar van de begindatum; ontbreekt die, dan de meest recente eerdere. Klik op een
        energiedrager om factoren en conversie te wijzigen.
      </p>

      {canManage && (
        <div className="mt-6">
          <Disclosure summary="Energiedrager toevoegen">
            <Form resetOnSuccess action={createCarrier} className="grid gap-3 md:grid-cols-6">
              <Field label="Naam" className="md:col-span-2">
                <input name="name" required maxLength={120} className="input" placeholder="bijv. Brandstofverbruik wagenpark - diesel" />
              </Field>
              <Field label="Eenheid">
                <input name="unit" required maxLength={20} className="input" placeholder="liter" />
              </Field>
              <Field label="Categorie">
                <Select name="category" options={options(ENERGY_CATEGORY_LABEL)} defaultValue="FUEL" />
              </Field>
              <Field label="Standaardscope">
                <Select name="defaultScope" options={SCOPES} defaultValue="1" />
              </Field>
              <Field label="GJ per eenheid">
                <input name="energyPerUnit" inputMode="decimal" className="input" placeholder="bijv. 0,0359" />
              </Field>
              <Field label="Groep in overzicht (leeg = automatisch)" className="md:col-span-2">
                <input name="reportGroup" className="input" placeholder="bijv. Brandstofverbruik bedrijfsmiddelen" />
              </Field>
              <Field label="Andere namen (komma-gescheiden)" className="md:col-span-3">
                <input name="aliases" className="input" />
              </Field>
              <Field label="Volgorde">
                <input name="sortOrder" type="number" defaultValue={0} className="input" />
              </Field>
              <div className="md:col-span-6">
                <SubmitButton>Toevoegen</SubmitButton>
              </div>
            </Form>
          </Disclosure>
        </div>
      )}
    </>
  );
}
