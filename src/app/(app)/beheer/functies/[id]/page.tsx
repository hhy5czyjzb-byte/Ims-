import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { Field, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { Form } from "@/components/form";
import { deleteJobFunction, updateJobFunction } from "../../actions";

export const metadata = { title: "Functie" };

export default async function FunctionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const canEdit = can(user.role, "masterdata.edit");
  const f = await prisma.jobFunction.findUnique({
    where: { id },
    include: { users: { select: { id: true, name: true } }, _count: { select: { raciAssignments: true } } },
  });
  if (!f) notFound();
  return (
    <>
      <PageHeader
        title={f.name}
        breadcrumb={[
          { href: "/beheer", label: "Stamgegevens" },
          { href: "/beheer/functies", label: "Functies" },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          {canEdit ? (
            <Form key={f.updatedAt.toISOString()} action={updateJobFunction.bind(null, id)} className="space-y-3">
              <Field label="Naam">
                <input name="name" required defaultValue={f.name} className="input" />
              </Field>
              <Field label="Omschrijving">
                <textarea name="description" rows={3} defaultValue={f.description ?? ""} className="input" />
              </Field>
              <SubmitButton>Opslaan</SubmitButton>
            </Form>
          ) : (
            <p className="text-sm">{f.description ?? "Geen omschrijving."}</p>
          )}
        </section>
        <aside className="space-y-4">
          <section className="card text-sm">
            <h2 className="mb-2">Gebruik</h2>
            <p>{f._count.raciAssignments}× in een RACI.</p>
            <p className="mt-1">Gebruikers: {f.users.map((u) => u.name).join(", ") || "geen"}</p>
          </section>
          {canEdit && (
            <section className="card print:hidden">
              <h2 className="mb-2">Verwijderen</h2>
              {f._count.raciAssignments > 0 ? (
                <p className="text-sm text-neutral-600">Deze functie staat in een RACI en kan niet worden verwijderd.</p>
              ) : (
                <Form action={deleteJobFunction.bind(null, id)}>
                  <SubmitButton variant="secondary" confirm={`Functie "${f.name}" verwijderen?`}>
                    Verwijderen
                  </SubmitButton>
                </Form>
              )}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
