import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { FUEL_TYPES, VEHICLE_TYPES, fleetMatrix, vehicleLabel } from "@/lib/fleet";
import { Disclosure, EmptyState, Field, PageHeader } from "@/components/ui";
import { ChartCard, GroupedColumns } from "@/components/charts";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { Co2Nav } from "@/components/co2-nav";
import { saveFleetYear } from "./actions";

export const metadata = { title: "Wagenpark" };

export default async function FleetPage({ searchParams }: { searchParams: Promise<{ soort?: string; jaar?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const canEdit = can(user.role, "co2.manage");
  const rows = await prisma.fleetCount.findMany({ orderBy: [{ year: "asc" }] });
  const presentTypes = VEHICLE_TYPES.filter((v) => rows.some((r) => r.vehicleType === v.key));
  const type = sp.soort === "alle" ? undefined : (sp.soort ?? (presentTypes.some((v) => v.key === "TRUCK") ? "TRUCK" : undefined));
  const m = fleetMatrix(rows, type);
  const title = type ? vehicleLabel(type) : "Alle voertuigen";
  const editYear = Number(sp.jaar) || (m.years[m.years.length - 1] ?? new Date().getUTCFullYear() - 1) + (sp.jaar ? 0 : 0);
  const prevYear = editYear - 1;
  const val = (y: number, v: string, f: string) => rows.find((r) => r.year === y && r.vehicleType === v && r.fuelType === f)?.count;
  const last = m.years[m.years.length - 1];
  const first = m.years[0];

  return (
    <>
      <PageHeader
        title="CO2-prestatieladder"
        description="Samenstelling van het wagenpark: aantal voertuigen per brandstoftype per jaar. Laat zien hoe de vloot verschuift van diesel naar hybride en elektrisch."
      />
      <Co2Nav />
      <form className="mb-4 flex flex-wrap items-end gap-2 print:hidden">
        <Field label="Soort voertuig">
          <select name="soort" defaultValue={type ?? "alle"} className="input">
            <option value="alle">Alle voertuigen</option>
            {VEHICLE_TYPES.map((v) => (
              <option key={v.key} value={v.key}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>
        <button className="btn-secondary">Tonen</button>
      </form>

      {m.years.length === 0 ? (
        <EmptyState>Nog geen aantallen voor {title.toLowerCase()}. Vul ze hieronder per jaar in.</EmptyState>
      ) : (
        <>
          <section className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              [`${title} ${last}`, String(m.total(last))],
              [`Zero-emissie ${last}`, `${m.zeroPct(last).toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%`],
              [`Diesel ${last}`, String(m.value("DIESEL", last))],
              [`Hybride + elektrisch ${last}`, String(m.value("HYBRID", last) + m.value("ELECTRIC", last))],
            ].map(([l, v]) => (
              <div key={l} className="rounded-md border border-neutral-200 bg-white px-3 py-2">
                <div className="text-xl font-bold tabular-nums">{v}</div>
                <div className="text-xs text-neutral-500">{l}</div>
              </div>
            ))}
          </section>
          <ChartCard title={`Brandstoftypes – ${title.toLowerCase()}`} subtitle={`Aantal voertuigen per brandstoftype, ${first}–${last}`} className="mb-6">
            <GroupedColumns
              groups={[...m.fuels.map((f) => f.label), "Totaal"]}
              series={m.years.map((y) => ({ name: String(y), values: [...m.fuels.map((f) => m.value(f.key, y)), m.total(y)] }))}
              height={240}
              unit=" voertuigen"
            />
          </ChartCard>
          <section className="card mb-6 overflow-x-auto p-0">
            <table className="table">
              <thead>
                <tr>
                  <th>Brandstoftype</th>
                  {m.years.map((y) => (
                    <th key={y} className="text-right">
                      {y}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {m.fuels.map((f) => (
                  <tr key={f.key}>
                    <td>{f.label}</td>
                    {m.years.map((y) => (
                      <td key={y} className="text-right tabular-nums">
                        {m.value(f.key, y)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="bg-neutral-50 font-semibold">
                  <td>Totaal</td>
                  {m.years.map((y) => (
                    <td key={y} className="text-right tabular-nums">
                      {m.total(y)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="text-neutral-600">Aandeel zero-emissie</td>
                  {m.years.map((y) => (
                    <td key={y} className="text-right tabular-nums text-neutral-600">
                      {m.zeroPct(y).toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </section>
        </>
      )}

      {canEdit && (
        <section className="card print:hidden">
          <Disclosure summary="Aantallen invullen of wijzigen" open={rows.length === 0}>
            <form className="mt-3 mb-3 flex items-end gap-2">
              {type && <input type="hidden" name="soort" value={type} />}
              <Field label="Jaar">
                <input name="jaar" type="number" defaultValue={editYear} className="input w-28" />
              </Field>
              <button className="btn-secondary">Dit jaar openen</button>
            </form>
            <Form key={`${editYear}-${rows.length}`} action={saveFleetYear} className="space-y-3">
              <input type="hidden" name="year" value={editYear} />
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{editYear}</th>
                      {FUEL_TYPES.map((f) => (
                        <th key={f.key} className="text-right">
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {VEHICLE_TYPES.map((v) => (
                      <tr key={v.key}>
                        <td className="whitespace-nowrap">{v.label}</td>
                        {FUEL_TYPES.map((f) => (
                          <td key={f.key} className="p-1">
                            <input
                              name={`c_${v.key}_${f.key}`}
                              type="number"
                              min={0}
                              defaultValue={val(editYear, v.key, f.key) ?? ""}
                              placeholder={val(prevYear, v.key, f.key) !== undefined ? String(val(prevYear, v.key, f.key)) : ""}
                              className="input w-20 text-right"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-neutral-500">
                Grijze getallen zijn de aantallen van {prevYear} (ter vergelijking). Leeg of 0 = geen voertuigen van dat type.
              </p>
              <SubmitButton>Opslaan {editYear}</SubmitButton>
            </Form>
          </Disclosure>
        </section>
      )}
    </>
  );
}
