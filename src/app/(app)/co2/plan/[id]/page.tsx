import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { getMeasureLookups } from "@/lib/co2-data";
import { PageHeader } from "@/components/ui";
import { Co2Nav } from "@/components/co2-nav";
import { Co2MeasureForm } from "@/components/co2-measure-form";
import { updateCo2Measure } from "../actions";

export const metadata = { title: "Maatregel" };

export default async function MeasurePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const action = await prisma.action.findUnique({ where: { id }, include: { co2Measure: true } });
  if (!action) notFound();
  await logAudit({ user, action: "VIEW", entityType: "Action", entityId: id });
  const canEdit = can(user.role, "co2.manage");
  const lookups = canEdit ? await getMeasureLookups() : null;
  return (
    <>
      <PageHeader
        title={`#${action.number} ${action.title}`}
        breadcrumb={[
          { href: "/co2", label: "CO2-prestatieladder" },
          { href: "/co2/plan", label: "Plan van aanpak" },
        ]}
        actions={
          <Link href={`/acties/${action.id}`} className="btn-secondary">
            Bekijken in de actielijst
          </Link>
        }
      />
      <Co2Nav />
      {canEdit && lookups ? (
        <section className="card">
          <Co2MeasureForm
            key={action.updatedAt.toISOString()}
            action={action}
            formAction={updateCo2Measure.bind(null, id)}
            lookups={lookups}
            submitLabel="Opslaan"
          />
        </section>
      ) : (
        <p className="text-sm text-neutral-600">Alleen QHSE wijzigt het plan van aanpak.</p>
      )}
    </>
  );
}
