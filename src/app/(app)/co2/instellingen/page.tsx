import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCo2Settings } from "@/lib/co2-settings";
import { Field, PageHeader, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { Co2Nav } from "@/components/co2-nav";
import { createOrganisation, deleteKpi, saveCo2Settings, saveKpi, updateOrganisation } from "./actions";

export const metadata = { title: "CO2-instellingen" };

const KPI_LABEL: Record<string, string> = { FTE: "Aantal FTE", REVENUE: "Omzet (€)", KM: "Gereden kilometers", OTHER: "Overig" };

export default async function Co2SettingsPage() {
  await requirePermission("co2.manage");
  const [settings, carriers, orgs, kpis] = await Promise.all([
    getCo2Settings(),
    prisma.energyCarrier.findMany({ where: { defaultScope: 2 }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.co2Organisation.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { consumptions: true } } } }),
    prisma.co2Kpi.findMany({ orderBy: [{ year: "desc" }, { kind: "asc" }], include: { organisation: { select: { name: true } } } }),
  ]);
  return (
    <>
      <PageHeader
        title="CO2-prestatieladder"
        description="Keuzevariabelen voor de berekening (zoals in het CO2-dashboard): type uitstoot, location-based scope 2, organisaties binnen de grens en kengetallen per jaar."
        print={false}
      />
      <Co2Nav />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3">Berekening</h2>
          <Form action={saveCo2Settings} className="space-y-3">
            <Field label="Type uitstoot" hint="Handboek 4.0 rapporteert well-to-wheel (WTW). Tank-to-wheel (TTW) is alleen de verbranding zelf.">
              <select name="emissionType" defaultValue={settings.emissionType} className="input">
                <option value="WTW">Well-to-wheel (WTW)</option>
                <option value="TTW">Tank-to-wheel (TTW)</option>
              </select>
            </Field>
            <Field label="Location-based scope 2: factor van" hint="Alle elektriciteit × deze factor (bijv. 'Elektriciteitsverbruik - gridmix (NL)').">
              <Select
                name="locationBasedCarrierId"
                options={carriers.map((c) => ({ value: c.id, label: c.name }))}
                defaultValue={settings.locationBasedCarrierId}
                placeholder="— Niet berekenen —"
              />
            </Field>
            <Field label="Kengetal voor de intensiteit">
              <select name="intensityKpi" defaultValue={settings.intensityKpi} className="input">
                <option value="FTE">Per FTE</option>
                <option value="REVENUE">Per mln € omzet</option>
              </select>
            </Field>
            <SubmitButton>Opslaan</SubmitButton>
          </Form>
        </section>

        <section className="card">
          <h2 className="mb-1">Organisaties binnen de grens</h2>
          <p className="mb-3 text-sm text-neutral-600">Het verbruik telt mee naar het percentage in de organisatiegrens (operational control).</p>
          <ul className="space-y-2">
            {orgs.map((o) => (
              <li key={o.id}>
                <Form key={o.updatedAt.toISOString()} action={updateOrganisation.bind(null, o.id)} className="flex flex-wrap items-end gap-2">
                  <Field label="Naam">
                    <input name="name" required defaultValue={o.name} className="input w-44" />
                  </Field>
                  <Field label="% in boundary">
                    <input name="boundaryPct" inputMode="decimal" defaultValue={String(o.boundaryPct).replace(".", ",")} className="input w-24" />
                  </Field>
                  <label className="flex items-center gap-1 pb-2 text-sm">
                    <input type="checkbox" name="active" defaultChecked={o.active} /> actief
                  </label>
                  <SubmitButton variant="secondary">Opslaan</SubmitButton>
                  <span className="pb-2 text-xs text-neutral-500">{o._count.consumptions} verbruiksregels</span>
                </Form>
              </li>
            ))}
          </ul>
          <Form resetOnSuccess action={createOrganisation} className="mt-4 flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-3">
            <Field label="Nieuwe organisatie">
              <input name="name" required className="input w-44" />
            </Field>
            <Field label="% in boundary">
              <input name="boundaryPct" defaultValue="100" inputMode="decimal" className="input w-24" />
            </Field>
            <SubmitButton variant="secondary">Toevoegen</SubmitButton>
          </Form>
        </section>
      </div>

      <section className="card mt-6">
        <h2 className="mb-3">Kengetallen per jaar</h2>
        <Form resetOnSuccess action={saveKpi} className="mb-4 flex flex-wrap items-end gap-2">
          <Field label="Jaar">
            <input name="year" type="number" required defaultValue={new Date().getUTCFullYear() - 1} className="input w-24" />
          </Field>
          <Field label="Kengetal">
            <select name="kind" className="input">
              {Object.entries(KPI_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Waarde">
            <input name="value" required inputMode="decimal" className="input w-36" />
          </Field>
          <Field label="Organisatie">
            <Select name="organisationId" options={orgs.map((o) => ({ value: o.id, label: o.name }))} placeholder="Hele groep" />
          </Field>
          <SubmitButton variant="secondary">Opslaan</SubmitButton>
        </Form>
        <table className="table">
          <thead>
            <tr>
              <th>Jaar</th>
              <th>Kengetal</th>
              <th className="text-right">Waarde</th>
              <th>Organisatie</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {kpis.map((k) => (
              <tr key={k.id}>
                <td>{k.year}</td>
                <td>{KPI_LABEL[k.kind] ?? k.kind}</td>
                <td className="text-right tabular-nums">{Number(k.value).toLocaleString("nl-NL")}</td>
                <td>{k.organisation?.name ?? "Hele groep"}</td>
                <td className="text-right">
                  <Form action={deleteKpi.bind(null, k.id)}>
                    <SubmitButton variant="link" className="text-xs" confirm="Kengetal verwijderen?">
                      Verwijderen
                    </SubmitButton>
                  </Form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-neutral-500">Omzet mag in euro of in miljoenen; boven de 10.000 rekent de app het om naar miljoenen.</p>
      </section>
    </>
  );
}
