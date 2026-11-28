import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { PageHeader } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { ContextNav } from "@/components/context-nav";
import { StakeholderFields } from "@/components/stakeholder-forms";
import { deleteStakeholder, updateStakeholder } from "../../actions";

export const metadata = { title: "Stakeholder wijzigen" };

export default async function EditStakeholderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission("context.edit");
  const { id } = await params;
  const [s, all] = await Promise.all([
    prisma.stakeholder.findUnique({ where: { id } }),
    prisma.stakeholder.findMany({ where: { influenceLevel: { not: null } }, distinct: ["influenceLevel"], select: { influenceLevel: true } }),
  ]);
  if (!s) notFound();
  await logAudit({ user, action: "VIEW", entityType: "Stakeholder", entityId: s.id, summary: `Stakeholder "${s.name}" bekeken` });
  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/context", label: "Context en stakeholders" },
          { href: "/context/stakeholders", label: "Stakeholders" },
        ]}
        title={s.name}
      />
      <ContextNav />
      <section className="card max-w-4xl">
        <StakeholderFields
          key={s.updatedAt.toISOString()}
          stakeholder={s}
          formAction={updateStakeholder.bind(null, id)}
          influences={all.map((x) => x.influenceLevel!)}
          submitLabel="Opslaan"
        />
        <Form action={deleteStakeholder.bind(null, id)} className="mt-4 border-t border-neutral-200 pt-3">
          <SubmitButton variant="link" confirm={`"${s.name}" verwijderen?`}>
            Verwijderen
          </SubmitButton>
        </Form>
      </section>
    </>
  );
}
