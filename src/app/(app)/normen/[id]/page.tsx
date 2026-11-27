import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { isCovered } from "@/lib/coverage";
import { can } from "@/lib/rbac";
import { flattenTree } from "@/lib/tree";
import { NORM_CATEGORY_LABEL, options } from "@/lib/labels";
import { Badge, Disclosure, EmptyState, Field, PageHeader, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createRequirement, deleteNorm, updateNorm } from "../actions";
import { Form } from "@/components/form";

export default async function NormDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const norm = await prisma.norm.findUnique({
    where: { id },
    include: {
      requirements: {
        include: { _count: { select: { documents: true, processes: true, processSteps: true, risks: true, actions: true, children: true } } },
      },
    },
  });
  if (!norm) notFound();
  await logAudit({ user, action: "VIEW", entityType: "Norm", entityId: id });

  const canEdit = can(user.role, "norms.edit");
  const rows = flattenTree(norm.requirements);
  const parentOptions = rows.map((r) => ({ value: r.id, label: `${"  ".repeat(r.depth)}${r.clause} ${r.title}` }));

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/normen", label: "Normenbeheer" }]}
        title={`${norm.code}${norm.version ? `:${norm.version}` : ""}`}
        description={
          <>
            {norm.name} · <Badge>{NORM_CATEGORY_LABEL[norm.category]}</Badge>
            {norm.description && <span className="mt-1 block">{norm.description}</span>}
          </>
        }
      />

      {canEdit && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <Disclosure summary="Eis of hoofdstuk toevoegen" open={rows.length === 0}>
            <Form resetOnSuccess action={createRequirement.bind(null, norm.id)} className="grid gap-3 sm:grid-cols-4">
              <Field label="Paragraaf">
                <input name="clause" required maxLength={30} className="input" placeholder="7.5.3" />
              </Field>
              <Field label="Titel" className="sm:col-span-3">
                <input name="title" required maxLength={300} className="input" />
              </Field>
              <Field label="Onder (optioneel)" className="sm:col-span-4">
                <Select name="parentId" options={parentOptions} placeholder="— Hoofdniveau —" />
              </Field>
              <Field label="Toelichting / eistekst" className="sm:col-span-4">
                <textarea name="description" rows={2} className="input" />
              </Field>
              <input type="hidden" name="sortOrder" value="0" />
              <div className="sm:col-span-4">
                <SubmitButton>Eis toevoegen</SubmitButton>
              </div>
            </Form>
          </Disclosure>
          <Disclosure summary="Norm wijzigen">
            <Form action={updateNorm.bind(null, norm.id)} className="grid gap-3 sm:grid-cols-2">
              <Field label="Code">
                <input name="code" required defaultValue={norm.code} className="input" />
              </Field>
              <Field label="Naam">
                <input name="name" required defaultValue={norm.name} className="input" />
              </Field>
              <Field label="Versie / jaar">
                <input name="version" defaultValue={norm.version ?? ""} className="input" />
              </Field>
              <Field label="Categorie">
                <Select name="category" options={options(NORM_CATEGORY_LABEL)} defaultValue={norm.category} />
              </Field>
              <Field label="Omschrijving" className="sm:col-span-2">
                <textarea name="description" rows={2} defaultValue={norm.description ?? ""} className="input" />
              </Field>
              <Field label="Volgorde">
                <input name="sortOrder" type="number" defaultValue={norm.sortOrder} className="input" />
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={norm.active} /> Actief
              </label>
              <div className="flex gap-2 sm:col-span-2">
                <SubmitButton>Opslaan</SubmitButton>
              </div>
            </Form>
            <Form action={deleteNorm.bind(null, norm.id)} className="mt-4 border-t border-neutral-200 pt-3">
              <SubmitButton variant="link" confirm={`Norm ${norm.code} en al haar eisen verwijderen? Koppelingen gaan verloren.`}>
                Norm verwijderen
              </SubmitButton>
            </Form>
          </Disclosure>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState>Deze norm heeft nog geen eisen.</EmptyState>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th className="w-24">Par.</th>
                <th>Eis</th>
                <th className="text-center">Documenten</th>
                <th className="text-center">Processen</th>
                <th className="text-center">Stappen</th>
                <th className="text-center">Risico&apos;s</th>
                <th className="text-center">Acties</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isChapter = r._count.children > 0;
                const covered = isCovered(r._count);
                return (
                  <tr key={r.id} className={isChapter ? "bg-neutral-50" : ""}>
                    <td className="tabular-nums" style={{ paddingLeft: `${0.75 + r.depth * 1}rem` }}>
                      {r.clause}
                    </td>
                    <td>
                      <Link href={`/normen/${norm.id}/eisen/${r.id}`} className={isChapter ? "font-semibold" : ""}>
                        {r.title}
                      </Link>
                    </td>
                    <Count n={r._count.documents} />
                    <Count n={r._count.processes} />
                    <Count n={r._count.processSteps} />
                    <Count n={r._count.risks} />
                    <Count n={r._count.actions} />
                    <td>
                      {isChapter ? (
                        <span className="text-xs text-neutral-400">Hoofdstuk</span>
                      ) : covered ? (
                        <Badge className="bg-green-100 text-green-800">Bewijs aanwezig</Badge>
                      ) : (
                        <Badge className="bg-red-100 text-brand-red-dark">Geen bewijs</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Count({ n }: { n: number }) {
  return <td className={`text-center tabular-nums ${n === 0 ? "text-neutral-300" : ""}`}>{n}</td>;
}
