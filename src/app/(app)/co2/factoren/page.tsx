import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { factorAt, formatFactor } from "@/lib/co2";
import { formatDate } from "@/lib/format";
import { ENERGY_CATEGORY_LABEL, options } from "@/lib/labels";
import { Badge, Disclosure, EmptyState, Field, PageHeader, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { Co2Nav } from "@/components/co2-nav";
import { addFactor, createCarrier, deleteFactor, updateCarrier } from "../actions";

export const metadata = { title: "Emissiefactoren" };

const SCOPES = [
  { value: "1", label: "Scope 1" },
  { value: "2", label: "Scope 2" },
  { value: "3", label: "Scope 3" },
];

export default async function FactorsPage() {
  const user = await requireUser();
  const canManage = can(user.role, "co2.manage");
  const carriers = await prisma.energyCarrier.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { factors: { orderBy: { validFrom: "desc" } }, _count: { select: { consumptions: true } } },
  });
  const today = new Date();

  return (
    <>
      <PageHeader
        title="CO2-prestatieladder"
        description="Energiedragers en hun emissiefactoren (kg CO2-equivalent per eenheid). Gebruik de actuele lijst van CO2emissiefactoren.nl. Een nieuwe factor krijgt een ingangsdatum; verbruik daarvóór blijft met de oude factor gerekend."
      />
      <Co2Nav />

      {canManage && (
        <div className="mb-6">
          <Disclosure summary="Energiedrager toevoegen" open={carriers.length === 0}>
            <Form resetOnSuccess action={createCarrier} className="grid gap-3 md:grid-cols-6">
              <Field label="Naam" className="md:col-span-2">
                <input name="name" required maxLength={120} className="input" placeholder="bijv. Diesel (B7)" />
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
              <Field label="Volgorde">
                <input name="sortOrder" type="number" defaultValue={0} className="input" />
              </Field>
              <Field label="Andere namen (komma-gescheiden, voor herkenning bij import)" className="md:col-span-6">
                <input name="aliases" className="input" placeholder="bijv. diesel, gasolie, B7" />
              </Field>
              <div className="md:col-span-6">
                <SubmitButton>Toevoegen</SubmitButton>
              </div>
            </Form>
          </Disclosure>
        </div>
      )}

      {carriers.length === 0 ? (
        <EmptyState>Nog geen energiedragers.</EmptyState>
      ) : (
        <div className="space-y-4">
          {carriers.map((c) => {
            const current = factorAt(
              c.factors.map((f) => ({ carrierId: c.id, factor: Number(f.factor), validFrom: f.validFrom })),
              c.id,
              today,
            );
            return (
              <section key={c.id} className={`card ${c.active ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2>
                      {c.name} <span className="text-sm font-normal text-neutral-500">per {c.unit}</span>
                    </h2>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                      <Badge>{ENERGY_CATEGORY_LABEL[c.category]}</Badge>
                      <Badge className="bg-brand-grey-light text-neutral-900">Scope {c.defaultScope}</Badge>
                      {!c.active && <Badge className="bg-neutral-200">Niet actief</Badge>}
                      <span className="text-neutral-500">{c._count.consumptions} verbruiksregel(s)</span>
                      {c.aliases && <span className="text-neutral-400">· ook: {c.aliases}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-neutral-500">Geldende factor</div>
                    {current ? (
                      <div className="text-xl font-bold tabular-nums">
                        {formatFactor(current.factor)} <span className="text-sm font-normal text-neutral-500">kg CO2e/{c.unit}</span>
                      </div>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-800">Geen factor — verbruik telt niet mee</Badge>
                    )}
                  </div>
                </div>

                {c.factors.length > 0 && (
                  <table className="table mt-3">
                    <thead>
                      <tr>
                        <th>Geldig vanaf</th>
                        <th className="text-right">kg CO2e / {c.unit}</th>
                        <th>Bron</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.factors.map((f) => (
                        <tr key={f.id}>
                          <td className="whitespace-nowrap">{formatDate(f.validFrom)}</td>
                          <td className="text-right tabular-nums">{formatFactor(Number(f.factor))}</td>
                          <td className="text-xs">
                            {f.source}
                            {f.notes && <div className="text-neutral-500">{f.notes}</div>}
                          </td>
                          <td className="text-right">
                            {canManage && (
                              <Form action={deleteFactor.bind(null, f.id)}>
                                <SubmitButton
                                  variant="link"
                                  className="text-xs"
                                  confirm="Deze factor verwijderen? De footprint wordt opnieuw berekend met de overige factoren."
                                >
                                  verwijderen
                                </SubmitButton>
                              </Form>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {canManage && (
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <Disclosure summary="Nieuwe factor toevoegen">
                      <Form resetOnSuccess action={addFactor.bind(null, c.id)} className="grid gap-2 sm:grid-cols-2">
                        <Field label={`kg CO2e per ${c.unit}`}>
                          <input name="factor" required inputMode="decimal" className="input" placeholder="bijv. 3,262" />
                        </Field>
                        <Field label="Geldig vanaf">
                          <input name="validFrom" type="date" required defaultValue={`${today.getUTCFullYear()}-01-01`} className="input" />
                        </Field>
                        <Field label="Bron" className="sm:col-span-2">
                          <input name="source" required maxLength={300} className="input" placeholder="bijv. CO2emissiefactoren.nl, lijst januari 2026" />
                        </Field>
                        <Field label="Toelichting" className="sm:col-span-2">
                          <input name="notes" className="input" placeholder="bijv. well-to-wheel" />
                        </Field>
                        <div className="sm:col-span-2">
                          <SubmitButton variant="secondary">Factor opslaan</SubmitButton>
                        </div>
                      </Form>
                    </Disclosure>
                    <Disclosure summary="Energiedrager wijzigen">
                      <Form key={c.updatedAt.toISOString()} action={updateCarrier.bind(null, c.id)} className="grid gap-2 sm:grid-cols-2">
                        <Field label="Naam">
                          <input name="name" required defaultValue={c.name} className="input" />
                        </Field>
                        <Field label="Eenheid">
                          <input name="unit" required defaultValue={c.unit} className="input" />
                        </Field>
                        <Field label="Categorie">
                          <Select name="category" options={options(ENERGY_CATEGORY_LABEL)} defaultValue={c.category} />
                        </Field>
                        <Field label="Standaardscope">
                          <Select name="defaultScope" options={SCOPES} defaultValue={String(c.defaultScope)} />
                        </Field>
                        <Field label="Andere namen" className="sm:col-span-2">
                          <input name="aliases" defaultValue={c.aliases ?? ""} className="input" />
                        </Field>
                        <Field label="Volgorde">
                          <input name="sortOrder" type="number" defaultValue={c.sortOrder} className="input" />
                        </Field>
                        <label className="flex items-center gap-2 self-end pb-2 text-sm">
                          <input type="checkbox" name="active" defaultChecked={c.active} /> Actief
                        </label>
                        <div className="sm:col-span-2">
                          <SubmitButton variant="secondary">Opslaan</SubmitButton>
                        </div>
                      </Form>
                    </Disclosure>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
