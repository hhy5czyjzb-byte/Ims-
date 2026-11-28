import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can, canEditConsumption } from "@/lib/rbac";
import { factorAt, formatKg, formatQuantity, formatFactor } from "@/lib/co2";
import { getCo2FormOptions, loadFactors } from "@/lib/co2-data";
import { formatDate } from "@/lib/format";
import { Disclosure, EmptyState, Field, PageHeader, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { Co2Nav } from "@/components/co2-nav";
import { ConsumptionFields } from "@/components/consumption-fields";
import { createConsumption } from "../actions";

export const metadata = { title: "Energieverbruik" };

type Search = { jaar?: string; drager?: string; discipline?: string; locatie?: string; materieel?: string };

export default async function ConsumptionPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const currentYear = new Date().getUTCFullYear();
  // Standaard het jaar van het meest recente verbruik (het lopende jaar is vaak nog leeg).
  const latest = await prisma.energyConsumption.findFirst({ orderBy: { periodStart: "desc" }, select: { periodStart: true } });
  const year =
    Number(sp.jaar) >= 2000 && Number(sp.jaar) <= 2100 ? Number(sp.jaar) : Math.min(currentYear, latest?.periodStart.getUTCFullYear() ?? currentYear);
  const where: Prisma.EnergyConsumptionWhereInput = {
    periodStart: { lt: new Date(Date.UTC(year + 1, 0, 1)) },
    periodEnd: { gte: new Date(Date.UTC(year, 0, 1)) },
    ...(sp.drager ? { carrierId: sp.drager } : {}),
    ...(sp.discipline ? { disciplineId: sp.discipline } : {}),
    ...(sp.locatie ? { locationId: sp.locatie } : {}),
    ...(sp.materieel ? { equipmentId: sp.materieel } : {}),
  };
  const [rows, opts, factors] = await Promise.all([
    prisma.energyConsumption.findMany({
      where,
      orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
      include: { carrier: true, discipline: true, location: true, equipment: true, createdBy: { select: { name: true } } },
      take: 2000,
    }),
    getCo2FormOptions(),
    loadFactors(),
  ]);

  return (
    <>
      <PageHeader title="CO2-prestatieladder" description="Energie- en brandstofverbruik per periode, discipline, locatie en materieel." />
      <Co2Nav />

      {can(user.role, "co2.enter") && (
        <div className="mb-6">
          <Disclosure summary="Verbruik invoeren" open={rows.length === 0}>
            {opts.carriers.length === 0 ? (
              <p className="text-sm text-neutral-600">
                Er zijn nog geen energiedragers.{" "}
                {can(user.role, "co2.manage") ? <Link href="/co2/factoren">Voeg ze toe onder Emissiefactoren.</Link> : "Vraag QHSE om ze toe te voegen."}
              </p>
            ) : (
              <Form resetOnSuccess action={createConsumption} className="grid gap-4 md:grid-cols-4">
                <ConsumptionFields carriers={opts.carriers} equipment={opts.equipment} disciplines={opts.disciplines} locations={opts.locations} />
                <div className="md:col-span-4">
                  <SubmitButton>Opslaan</SubmitButton>
                </div>
              </Form>
            )}
          </Disclosure>
        </div>
      )}

      <form className="mb-4 flex flex-wrap items-end gap-2">
        <Field label="Jaar">
          <select name="jaar" defaultValue={String(year)} className="input">
            {Array.from({ length: 8 }, (_, i) => currentYear - 6 + i).map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </Field>
        <Field label="Energiedrager">
          <Select name="drager" options={opts.carriers.map((c) => ({ value: c.id, label: c.name }))} defaultValue={sp.drager} placeholder="Alle" />
        </Field>
        <Field label="Discipline">
          <Select name="discipline" options={opts.disciplines} defaultValue={sp.discipline} placeholder="Alle" />
        </Field>
        <Field label="Locatie">
          <Select name="locatie" options={opts.locations} defaultValue={sp.locatie} placeholder="Alle" />
        </Field>
        <Field label="Materieel">
          <Select name="materieel" options={opts.equipment.map((e) => ({ value: e.id, label: e.label }))} defaultValue={sp.materieel} placeholder="Alle" />
        </Field>
        <button className="btn-secondary">Filteren</button>
      </form>

      {rows.length === 0 ? (
        <EmptyState>Geen verbruik in {year} met deze filters.</EmptyState>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Periode</th>
                <th>Energiedrager</th>
                <th className="text-right">Hoeveelheid</th>
                <th className="text-right">Factor</th>
                <th className="text-right">CO2e</th>
                <th>Scope</th>
                <th>Discipline / locatie / materieel</th>
                <th>Omschrijving</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const q = Number(r.quantity);
                const f = factorAt(factors, r.carrierId, r.periodStart);
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">
                      {formatDate(r.periodStart)} – {formatDate(r.periodEnd)}
                    </td>
                    <td>{r.carrier.name}</td>
                    <td className="text-right whitespace-nowrap tabular-nums">
                      {formatQuantity(q)} {r.carrier.unit}
                    </td>
                    <td className="text-right text-xs whitespace-nowrap text-neutral-500 tabular-nums">
                      {f ? formatFactor(f.factor) : <span className="font-semibold text-amber-700">geen</span>}
                    </td>
                    <td className="text-right whitespace-nowrap tabular-nums">{f ? formatKg(q * f.factor) : "—"}</td>
                    <td>{r.scope ?? r.carrier.defaultScope}</td>
                    <td className="text-xs">
                      {r.discipline?.name ?? "Bedrijfsbreed"} · {r.location?.name ?? "—"}
                      {r.equipment && <> · {r.equipment.code ?? r.equipment.name}</>}
                    </td>
                    <td className="text-xs text-neutral-600">
                      {r.description}
                      {r.createdBy && <div className="text-neutral-400">{r.createdBy.name}</div>}
                    </td>
                    <td>
                      {canEditConsumption(user, r) && (
                        <Link href={`/co2/verbruik/${r.id}`} className="text-xs">
                          Wijzigen
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-neutral-500">
        CO2e per regel over de hele verbruiksperiode, met de factor die gold op de begindatum. Loopt een periode over de jaargrens, dan rekent de footprint naar
        rato toe.
      </p>
    </>
  );
}
