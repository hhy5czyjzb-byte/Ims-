import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { Field, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { Form } from "@/components/form";
import { createMasterData } from "../actions";
import { BeheerNav } from "../beheer-nav";

export const metadata = { title: "Functies" };

export default async function FunctionsPage() {
  const user = await requireUser();
  const canEdit = can(user.role, "masterdata.edit");
  const functions = await prisma.jobFunction.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { raciAssignments: true, users: true } } } });
  return (
    <>
      <PageHeader title="Stamgegevens" description="Functies voor de RACI bij processen en om gebruikers een functie te geven." />
      <BeheerNav active="/beheer/functies" />
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Functie</th>
              <th>Omschrijving</th>
              <th className="text-right">In RACI</th>
              <th className="text-right">Gebruikers</th>
            </tr>
          </thead>
          <tbody>
            {functions.map((f) => (
              <tr key={f.id}>
                <td>
                  <Link href={`/beheer/functies/${f.id}`} className="font-medium">
                    {f.name}
                  </Link>
                </td>
                <td className="text-neutral-600">{f.description ?? "—"}</td>
                <td className="text-right tabular-nums">{f._count.raciAssignments}</td>
                <td className="text-right tabular-nums">{f._count.users}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <section className="card mt-6 print:hidden">
          <h2 className="mb-3">Nieuwe functie</h2>
          <Form resetOnSuccess action={createMasterData.bind(null, "jobFunction")} className="grid gap-3 md:grid-cols-3">
            <Field label="Naam">
              <input name="name" required className="input" />
            </Field>
            <Field label="Omschrijving" className="md:col-span-2">
              <input name="description" className="input" />
            </Field>
            <div>
              <SubmitButton>Toevoegen</SubmitButton>
            </div>
          </Form>
        </section>
      )}
    </>
  );
}
