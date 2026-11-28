import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { getLookups } from "@/lib/lookups";
import { readChanges } from "@/lib/audit-diff";
import { euroLabel, fuelLabel, vehicleLabel } from "@/lib/fleet";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { VehicleForm } from "@/components/vehicle-form";
import { deleteVehicle, updateVehicle } from "../../wagenpark/actions";

export const metadata = { title: "Voertuig" };

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const v = await prisma.equipment.findUnique({ where: { id }, include: { _count: { select: { consumptions: true } } } });
  if (!v) notFound();
  await logAudit({ user, action: "VIEW", entityType: "Equipment", entityId: id, summary: `Voertuig "${v.name}" bekeken` });
  const canManage = can(user.role, "co2.manage");
  const [carriers, lookups, history] = await Promise.all([
    prisma.energyCarrier.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getLookups(),
    prisma.auditLog.findMany({
      where: { entityType: "Equipment", entityId: id, action: { not: "VIEW" } },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { user: { select: { name: true } } },
    }),
  ]);

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/co2", label: "CO2" },
          { href: "/co2/materieel", label: "Voertuigen en materieel" },
        ]}
        title={`${v.code ? `${v.code} · ` : ""}${v.name}`}
        description={[
          v.vehicleType && vehicleLabel(v.vehicleType),
          v.fuelType && fuelLabel(v.fuelType),
          v.euroClass && euroLabel(v.euroClass),
          `${v._count.consumptions} verbruiksregel(s)`,
        ]
          .filter(Boolean)
          .join(" · ")}
      />
      {canManage ? (
        <section className="card mb-6">
          <VehicleForm
            key={v.updatedAt.toISOString()}
            vehicle={v}
            formAction={updateVehicle.bind(null, v.id)}
            lookups={{ carriers: carriers.map((c) => ({ value: c.id, label: c.name })), disciplines: lookups.disciplines, locations: lookups.locations }}
            submitLabel="Opslaan"
          />
          {v._count.consumptions === 0 && (
            <Form action={deleteVehicle.bind(null, v.id)} className="mt-4 border-t border-neutral-200 pt-3">
              <SubmitButton variant="link" className="text-xs">
                Verwijderen
              </SubmitButton>
            </Form>
          )}
        </section>
      ) : (
        <p className="text-sm text-neutral-600">Alleen QHSE kan voertuigen wijzigen.</p>
      )}
      {history.length > 0 && (
        <section className="card">
          <h2 className="mb-2">Wijzigingen</h2>
          <ul className="space-y-2 text-sm">
            {history.map((h) => (
              <li key={h.id}>
                <span className="text-neutral-500">
                  {formatDate(h.createdAt)} · {h.user?.name ?? "—"}:
                </span>{" "}
                {h.summary}
                {readChanges(h.details).map((c) => (
                  <div key={c.field} className="ml-4 text-xs text-neutral-600">
                    {c.label}: {c.from || "—"} → {c.to || "—"}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
