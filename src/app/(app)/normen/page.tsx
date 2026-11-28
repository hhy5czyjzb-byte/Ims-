import { NormCoverageChart } from "@/components/module-charts";
import Link from "next/link";
import { NormCategory } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { getNormCoverage } from "@/lib/coverage";
import { can } from "@/lib/rbac";
import { NORM_CATEGORY_LABEL, options } from "@/lib/labels";
import { Badge, Disclosure, EmptyState, Field, PageHeader, ProgressBar, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createNorm } from "./actions";
import { Form } from "@/components/form";

export const metadata = { title: "Normenbeheer" };

export default async function NormsPage() {
  const user = await requireUser();
  const norms = await getNormCoverage();
  const canEdit = can(user.role, "norms.edit");

  return (
    <>
      <PageHeader
        title="Normenbeheer"
        description="Alle normen en certificeringen met hun eisen. Koppel documenten, processen en risico's aan eisen; één bewijsstuk kan meerdere normen afdekken."
      />
      <NormCoverageChart />

      {canEdit && (
        <div className="mb-6">
          <Disclosure summary="Norm toevoegen">
            <Form action={createNorm} className="grid gap-4 md:grid-cols-2">
              <Field label="Code" hint="Bijv. ISO 9001, BRL 2000, SC-530">
                <input name="code" required maxLength={50} className="input" />
              </Field>
              <Field label="Naam">
                <input name="name" required maxLength={200} className="input" />
              </Field>
              <Field label="Versie / jaar">
                <input name="version" className="input" placeholder="2015" />
              </Field>
              <Field label="Categorie">
                <Select name="category" options={options(NORM_CATEGORY_LABEL)} defaultValue={NormCategory.OTHER} />
              </Field>
              <Field label="Omschrijving" className="md:col-span-2">
                <textarea name="description" rows={2} className="input" />
              </Field>
              <input type="hidden" name="sortOrder" value={norms.length * 10 + 10} />
              <div className="md:col-span-2">
                <SubmitButton>Norm opslaan</SubmitButton>
              </div>
            </Form>
          </Disclosure>
        </div>
      )}

      {norms.length === 0 ? (
        <EmptyState>Nog geen normen. {canEdit ? "Voeg hierboven een norm toe." : ""}</EmptyState>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Norm</th>
                <th>Categorie</th>
                <th className="text-right">Eisen</th>
                <th className="w-64">Dekking met bewijs</th>
              </tr>
            </thead>
            <tbody>
              {norms.map((n) => (
                <tr key={n.id} className={n.active ? "" : "opacity-50"}>
                  <td>
                    <Link href={`/normen/${n.id}`} className="font-medium">
                      {n.code}
                    </Link>
                    {n.version && <span className="ml-1 text-neutral-500">:{n.version}</span>}
                    <div className="text-xs text-neutral-500">{n.name}</div>
                  </td>
                  <td>
                    <Badge>{NORM_CATEGORY_LABEL[n.category]}</Badge>
                    {!n.active && <Badge className="ml-1 bg-neutral-200 text-neutral-600">Inactief</Badge>}
                  </td>
                  <td className="text-right tabular-nums">{n.requirementCount}</td>
                  <td>
                    {n.leafCount > 0 ? (
                      <>
                        <ProgressBar value={n.coveragePct} />
                        <div className="mt-0.5 text-xs text-neutral-500">
                          {n.covered} van {n.leafCount} eisen afgedekt
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-neutral-400">Nog geen eisen</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
