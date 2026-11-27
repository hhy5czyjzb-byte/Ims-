import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { getLookups } from "@/lib/lookups";
import { Disclosure, EmptyState, Field, PageHeader, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createProcess } from "./actions";
import { Form } from "@/components/form";

export const metadata = { title: "Processen" };

export default async function ProcessesPage() {
  const user = await requireUser();
  const [processes, disciplines, lookups] = await Promise.all([
    prisma.process.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { owner: { select: { name: true } }, _count: { select: { steps: true, documents: true, requirements: true } } },
    }),
    prisma.discipline.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    getLookups(),
  ]);
  const canEdit = can(user.role, "processes.edit");

  // Proceskaart: kolom per discipline, plus bedrijfsbrede processen.
  const columns = [{ id: null as string | null, name: "Bedrijfsbreed" }, ...disciplines.map((d) => ({ id: d.id as string | null, name: d.name }))].map(
    (col) => ({ ...col, processes: processes.filter((p) => p.disciplineId === col.id) }),
  );

  return (
    <>
      <PageHeader title="Processen" description="Proceskaart per discipline. Klik op een proces voor de processtappen, documenten en eigenaarschap (RACI)." />

      {canEdit && (
        <div className="mb-6">
          <Disclosure summary="Proces toevoegen">
            <Form action={createProcess} className="grid gap-4 md:grid-cols-3">
              <Field label="Naam" className="md:col-span-2">
                <input name="name" required maxLength={200} className="input" placeholder="Bijv. Productie prefab elementen" />
              </Field>
              <Field label="Code (optioneel)">
                <input name="code" maxLength={30} className="input" placeholder="P-PRE-01" />
              </Field>
              <Field label="Discipline">
                <Select name="disciplineId" options={lookups.disciplines} placeholder="Bedrijfsbreed" />
              </Field>
              <Field label="Proceseigenaar">
                <Select name="ownerId" options={lookups.users} placeholder="— Kies —" />
              </Field>
              <Field label="Doel van het proces" className="md:col-span-3">
                <textarea name="purpose" rows={2} className="input" />
              </Field>
              <input type="hidden" name="sortOrder" value="0" />
              <div className="md:col-span-3">
                <SubmitButton>Proces aanmaken</SubmitButton>
              </div>
            </Form>
          </Disclosure>
        </div>
      )}

      {processes.length === 0 ? (
        <EmptyState>Nog geen processen vastgelegd.</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {columns.map((col) => (
            <section key={col.id ?? "algemeen"} className="rounded-lg bg-neutral-100 p-3">
              <h2 className="mb-3 border-b-2 border-brand-red pb-1 text-sm tracking-wide uppercase">{col.name}</h2>
              {col.processes.length === 0 ? (
                <p className="text-xs text-neutral-400">Geen processen</p>
              ) : (
                <ul className="space-y-2">
                  {col.processes.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/processen/${p.id}`}
                        className="block rounded-md border border-neutral-200 bg-white p-3 text-inherit no-underline shadow-sm transition hover:border-brand-red hover:no-underline"
                      >
                        <div className="font-medium text-neutral-900">{p.name}</div>
                        {p.code && <div className="text-xs text-neutral-500">{p.code}</div>}
                        <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-neutral-500">
                          <span>{p._count.steps} stappen</span>
                          <span>{p._count.documents} docs</span>
                          <span>{p._count.requirements} eisen</span>
                        </div>
                        {p.owner && <div className="mt-1 text-xs text-neutral-500">Eigenaar: {p.owner.name}</div>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
