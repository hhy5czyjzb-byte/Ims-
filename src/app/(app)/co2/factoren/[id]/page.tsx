import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { carrierGroup } from "@/lib/co2";
import { formatDateTime } from "@/lib/format";
import { readChanges } from "@/lib/audit-diff";
import { ENERGY_CATEGORY_LABEL, options } from "@/lib/labels";
import { Field, PageHeader, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { Co2Nav } from "@/components/co2-nav";
import { FactorFields } from "@/components/co2-factor-fields";
import { addFactor, deleteFactor, updateCarrier, updateFactor } from "../../actions";

export const metadata = { title: "Energiedrager" };

const SCOPES = [
  { value: "1", label: "Scope 1" },
  { value: "2", label: "Scope 2" },
  { value: "3", label: "Scope 3 / zakelijk reizen" },
];

export default async function CarrierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const canManage = can(user.role, "co2.manage");
  const c = await prisma.energyCarrier.findUnique({
    where: { id },
    include: { factors: { orderBy: { validFrom: "desc" } }, _count: { select: { consumptions: true } } },
  });
  if (!c) notFound();
  const history = await prisma.auditLog.findMany({
    where: {
      action: { not: "VIEW" },
      OR: [
        { entityType: "EnergyCarrier", entityId: id },
        { entityType: "EmissionFactor", entityId: { in: c.factors.map((f) => f.id) } },
        { entityType: "EmissionFactor", summary: { contains: c.name } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { user: { select: { name: true } } },
  });
  const nextYear = (c.factors[0]?.validFrom.getUTCFullYear() ?? new Date().getUTCFullYear() - 1) + 1;
  return (
    <>
      <PageHeader
        title={c.name}
        description={`${carrierGroup(c)} · scope ${c.defaultScope} · per ${c.unit} · ${c._count.consumptions} verbruiksregels`}
        breadcrumb={[
          { href: "/co2", label: "CO2-prestatieladder" },
          { href: "/co2/factoren", label: "Emissiefactoren" },
        ]}
      />
      <Co2Nav />
      {canManage && (
        <section className="card mb-6">
          <h2 className="mb-3">Energiedrager</h2>
          <Form key={c.updatedAt.toISOString()} action={updateCarrier.bind(null, id)} className="grid gap-3 md:grid-cols-6">
            <Field label="Naam" className="md:col-span-2">
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
            <Field label="GJ per eenheid" hint="Energie-conversie (energiebalans)">
              <input
                name="energyPerUnit"
                inputMode="decimal"
                defaultValue={c.energyPerUnit === null ? "" : String(Number(c.energyPerUnit)).replace(".", ",")}
                className="input"
              />
            </Field>
            <Field label="Groep in overzicht" className="md:col-span-2" hint={`Leeg = automatisch (${carrierGroup({ ...c, reportGroup: null })})`}>
              <input name="reportGroup" defaultValue={c.reportGroup ?? ""} className="input" />
            </Field>
            <Field label="Andere namen (komma-gescheiden)" className="md:col-span-3">
              <input name="aliases" defaultValue={c.aliases ?? ""} className="input" />
            </Field>
            <Field label="Volgorde">
              <input name="sortOrder" type="number" defaultValue={c.sortOrder} className="input" />
            </Field>
            <label className="flex items-center gap-2 text-sm md:col-span-6">
              <input type="checkbox" name="active" defaultChecked={c.active} /> Actief
            </label>
            <div className="md:col-span-6">
              <SubmitButton>Opslaan</SubmitButton>
            </div>
          </Form>
        </section>
      )}

      <section className="card mb-6">
        <h2 className="mb-3">Emissiefactoren per jaar (gram CO2 per {c.unit})</h2>
        {c.factors.length === 0 && <p className="mb-3 text-sm text-brand-red">Nog geen factor: verbruik van deze drager telt niet mee.</p>}
        <div className="space-y-3">
          {c.factors.map((f) =>
            canManage ? (
              <div key={f.id} className="rounded border border-neutral-200 p-3">
                <Form action={updateFactor.bind(null, f.id)} className="grid gap-2 md:grid-cols-7">
                  <FactorFields f={f} unit={c.unit} />
                  <div className="flex items-end gap-3 md:col-span-7">
                    <SubmitButton variant="secondary">Opslaan</SubmitButton>
                  </div>
                </Form>
                <Form action={deleteFactor.bind(null, f.id)} className="mt-1">
                  <SubmitButton variant="link" className="text-xs" confirm={`Factor vanaf ${f.validFrom.toISOString().slice(0, 10)} verwijderen?`}>
                    Verwijderen
                  </SubmitButton>
                </Form>
              </div>
            ) : (
              <p key={f.id} className="text-sm">
                {f.validFrom.getUTCFullYear()}: WTW {Math.round(Number(f.factor) * 1000)} g ({f.source})
              </p>
            ),
          )}
        </div>
        {canManage && (
          <div className="mt-4 border-t border-neutral-100 pt-3">
            <h3 className="mb-2 text-sm font-semibold">Nieuwe factor (bijv. lijst {nextYear})</h3>
            <Form resetOnSuccess action={addFactor.bind(null, id)} className="grid gap-2 md:grid-cols-7">
              <FactorFields unit={c.unit} defaultDate={new Date(Date.UTC(nextYear, 0, 1))} />
              <div className="md:col-span-7">
                <SubmitButton>Factor toevoegen</SubmitButton>
              </div>
            </Form>
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="mb-2">Wijzigingshistorie</h2>
        {history.length === 0 ? (
          <p className="text-sm text-neutral-500">Nog geen wijzigingen vastgelegd.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 text-sm">
            {history.map((h) => (
              <li key={h.id} className="py-1.5">
                <span className="text-xs text-neutral-500">
                  {formatDateTime(h.createdAt)} · {h.user?.name ?? h.userEmail ?? "Systeem"}
                </span>
                <div>{h.summary}</div>
                {readChanges(h.details).map((ch) => (
                  <div key={ch.field} className="text-xs text-neutral-600">
                    {ch.label}: <span className="line-through">{ch.from}</span> → {ch.to}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-neutral-500">Volledige audit trail: tabblad Logboek.</p>
      </section>
    </>
  );
}
