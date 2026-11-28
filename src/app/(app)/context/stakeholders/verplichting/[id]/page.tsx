import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { legalDisplayCode } from "@/lib/compliance";
import { PageHeader } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { ContextNav } from "@/components/context-nav";
import { ObligationFields } from "@/components/stakeholder-forms";
import { deleteObligation, updateObligation } from "../../../actions";

export const metadata = { title: "Verplichting wijzigen" };

export default async function EditObligationPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("context.edit");
  const { id } = await params;
  const [o, stakeholders, legal] = await Promise.all([
    prisma.stakeholderObligation.findUnique({
      where: { id },
      include: { stakeholders: { select: { id: true } }, legalRequirements: { select: { id: true } } },
    }),
    prisma.stakeholder.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.legalRequirement.findMany({
      where: { active: true },
      orderBy: [{ externalRef: "asc" }, { title: "asc" }],
      select: { id: true, number: true, externalRef: true, title: true },
    }),
  ]);
  if (!o) notFound();
  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/context", label: "Context en stakeholders" },
          { href: "/context/stakeholders#verplichtingen", label: "Verplichtingen" },
        ]}
        title={o.stakeholderText}
        description={o.obligation}
      />
      <ContextNav />
      <section className="card max-w-5xl">
        <ObligationFields
          obligation={o}
          selectedStakeholders={o.stakeholders.map((s) => s.id)}
          selectedLegal={o.legalRequirements.map((l) => l.id)}
          stakeholderOptions={stakeholders.map((s) => ({ value: s.id, label: s.name }))}
          legalOptions={legal.map((l) => ({ value: l.id, label: `${legalDisplayCode(l)} ${l.title}` }))}
          formAction={updateObligation.bind(null, id)}
          submitLabel="Opslaan"
        />
        <Form action={deleteObligation.bind(null, id)} className="mt-4 border-t border-neutral-200 pt-3">
          <SubmitButton variant="link" confirm="Deze verplichting verwijderen?">
            Verwijderen
          </SubmitButton>
        </Form>
      </section>
    </>
  );
}
