import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { PageHeader } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { Co2Nav } from "@/components/co2-nav";
import { DkmpForm } from "@/components/dkmp-form";
import { deleteDkmpItem, updateDkmpItem } from "../actions";

export const metadata = { title: "DKMP-regel" };

export default async function DkmpItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePagePermission("co2.manage");
  const [item, carriers, sections] = await Promise.all([
    prisma.dataQualityItem.findUnique({ where: { id } }),
    prisma.energyCarrier.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.dataQualityItem.findMany({ distinct: ["section"], select: { section: true } }),
  ]);
  if (!item) notFound();
  await logAudit({ user, action: "VIEW", entityType: "DataQualityItem", entityId: item.id, summary: `DKMP-onderdeel bekeken` });
  return (
    <>
      <PageHeader
        title={`${item.section} – ${item.stream}`}
        breadcrumb={[
          { href: "/co2", label: "CO2-prestatieladder" },
          { href: "/co2/dkmp", label: "DKMP" },
        ]}
        print={false}
      />
      <Co2Nav />
      <section className="card">
        <DkmpForm
          key={item.updatedAt.toISOString()}
          item={item}
          formAction={updateDkmpItem.bind(null, id)}
          carriers={carriers.map((c) => ({ value: c.id, label: c.name }))}
          sections={sections.map((s) => s.section)}
          submitLabel="Opslaan"
        />
        <Form action={deleteDkmpItem.bind(null, id)} className="mt-4">
          <SubmitButton variant="link" confirm="Deze regel uit het DKMP verwijderen?">
            Verwijderen
          </SubmitButton>
        </Form>
      </section>
    </>
  );
}
