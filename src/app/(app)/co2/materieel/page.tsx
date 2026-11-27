import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { getLookups } from "@/lib/lookups";
import { Badge, Disclosure, EmptyState, Field, PageHeader, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { Co2Nav } from "@/components/co2-nav";
import { createEquipment, toggleEquipment } from "../actions";

export const metadata = { title: "Materieel" };

export default async function EquipmentPage() {
  const user = await requireUser();
  const canManage = can(user.role, "co2.manage");
  const [equipment, carriers, lookups] = await Promise.all([
    prisma.equipment.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { defaultCarrier: true, discipline: true, location: true, _count: { select: { consumptions: true } } },
    }),
    prisma.energyCarrier.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getLookups(),
  ]);

  return (
    <>
      <PageHeader
        title="CO2-prestatieladder"
        description="Materieel (voertuigen, machines, installaties) om verbruik per materieel vast te leggen en te analyseren."
      />
      <Co2Nav />
      {canManage && (
        <div className="mb-6">
          <Disclosure summary="Materieel toevoegen">
            <Form resetOnSuccess action={createEquipment} className="grid gap-3 md:grid-cols-3">
              <Field label="Naam">
                <input name="name" required maxLength={200} className="input" placeholder="bijv. Shovel Volvo L120" />
              </Field>
              <Field label="Kenteken / machinenummer">
                <input name="code" maxLength={50} className="input" />
              </Field>
              <Field label="Type">
                <input name="type" maxLength={100} className="input" placeholder="shovel, vrachtwagen, generator…" />
              </Field>
              <Field label="Standaard energiedrager">
                <Select name="defaultCarrierId" options={carriers.map((c) => ({ value: c.id, label: c.name }))} placeholder="—" />
              </Field>
              <Field label="Discipline">
                <Select name="disciplineId" options={lookups.disciplines} placeholder="Bedrijfsbreed" />
              </Field>
              <Field label="Locatie">
                <Select name="locationId" options={lookups.locations} placeholder="—" />
              </Field>
              <div className="md:col-span-3">
                <SubmitButton>Toevoegen</SubmitButton>
              </div>
            </Form>
          </Disclosure>
        </div>
      )}
      {equipment.length === 0 ? (
        <EmptyState>Nog geen materieel vastgelegd.</EmptyState>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Materieel</th>
                <th>Type</th>
                <th>Energiedrager</th>
                <th>Discipline / locatie</th>
                <th className="text-center">Verbruiksregels</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {equipment.map((e) => (
                <tr key={e.id} className={e.active ? "" : "opacity-50"}>
                  <td>
                    <span className="font-medium">{e.name}</span>
                    {e.code && <span className="ml-1 font-mono text-xs text-neutral-500">{e.code}</span>}
                    {!e.active && <Badge className="ml-1 bg-neutral-200">Buiten gebruik</Badge>}
                  </td>
                  <td>{e.type ?? "—"}</td>
                  <td>{e.defaultCarrier?.name ?? "—"}</td>
                  <td className="text-xs">
                    {e.discipline?.name ?? "Bedrijfsbreed"} · {e.location?.name ?? "—"}
                  </td>
                  <td className="text-center tabular-nums">{e._count.consumptions}</td>
                  <td className="text-right">
                    {canManage && (
                      <Form action={toggleEquipment.bind(null, e.id)}>
                        <SubmitButton variant="link" className="text-xs">
                          {e.active ? "Buiten gebruik" : "In gebruik"}
                        </SubmitButton>
                      </Form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
