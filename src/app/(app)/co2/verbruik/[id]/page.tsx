import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { canEditConsumption } from "@/lib/rbac";
import { getCo2FormOptions } from "@/lib/co2-data";
import { toDateInput } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { ConsumptionFields } from "@/components/consumption-fields";
import { deleteConsumption, updateConsumption } from "../../actions";

export default async function ConsumptionEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const c = await prisma.energyConsumption.findUnique({ where: { id }, include: { carrier: true } });
  if (!c) notFound();
  await logAudit({ user, action: "VIEW", entityType: "EnergyConsumption", entityId: id });
  if (!canEditConsumption(user, c)) {
    return (
      <div className="card max-w-xl">
        <h2>Geen toegang</h2>
        <p className="mt-2 text-sm text-neutral-600">Alleen QHSE of degene die dit verbruik heeft ingevoerd, kan het wijzigen.</p>
      </div>
    );
  }
  const opts = await getCo2FormOptions();
  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/co2", label: "CO2" },
          { href: "/co2/verbruik", label: "Verbruik" },
        ]}
        title={`Verbruik wijzigen — ${c.carrier.name}`}
      />
      <div className="card">
        <Form key={c.updatedAt.toISOString()} action={updateConsumption.bind(null, id)} className="grid gap-4 md:grid-cols-4">
          <ConsumptionFields
            carriers={opts.carriers}
            equipment={opts.equipment}
            disciplines={opts.disciplines}
            locations={opts.locations}
            defaults={{
              carrierId: c.carrierId,
              quantity: String(Number(c.quantity)).replace(".", ","),
              periodStart: toDateInput(c.periodStart),
              periodEnd: toDateInput(c.periodEnd),
              scope: c.scope,
              description: c.description,
              disciplineId: c.disciplineId,
              locationId: c.locationId,
              equipmentId: c.equipmentId,
            }}
          />
          <div className="md:col-span-4">
            <SubmitButton>Opslaan</SubmitButton>
          </div>
        </Form>
        <Form action={deleteConsumption.bind(null, id)} className="mt-4 border-t border-neutral-200 pt-3">
          <SubmitButton variant="link" confirm="Deze verbruiksregel verwijderen?">
            Verwijderen
          </SubmitButton>
        </Form>
      </div>
    </>
  );
}
