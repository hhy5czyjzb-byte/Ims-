import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { Form } from "@/components/form";
import { deleteDiscipline, updateDiscipline } from "../../actions";
import { DisciplineFields } from "../../discipline-fields";

export const metadata = { title: "Bedrijfsonderdeel" };

export default async function DisciplinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const canEdit = can(user.role, "masterdata.edit");
  const d = await prisma.discipline.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          actions: true,
          risks: true,
          legalRequirements: true,
          environmentalAspects: true,
          processes: true,
          energyConsumptions: true,
          reports: true,
          equipment: true,
          reductionTargets: true,
          audits: true,
          suppliers: true,
        },
      },
    },
  });
  if (!d) notFound();
  await logAudit({ user, action: "VIEW", entityType: "Discipline", entityId: id });
  const c = d._count;
  const links = [
    ["Acties", c.actions],
    ["Risico's en kansen", c.risks],
    ["Wettelijke eisen", c.legalRequirements],
    ["Milieuaspecten", c.environmentalAspects],
    ["Meldingen", c.reports],
    ["Processen", c.processes],
    ["Audits", c.audits],
    ["Materieel", c.equipment],
    ["Energieverbruik (regels)", c.energyConsumptions],
    ["CO2-doelstellingen", c.reductionTargets],
    ["Leveranciers", c.suppliers],
  ] as const;
  const used = links.reduce((n, [, v]) => n + v, 0);
  return (
    <>
      <PageHeader
        title={d.name}
        description={d.description ?? undefined}
        breadcrumb={[
          { href: "/beheer", label: "Stamgegevens" },
          { href: "/beheer/bedrijfsonderdelen", label: "Bedrijfsonderdelen" },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          {canEdit ? (
            <Form key={d.updatedAt.toISOString()} action={updateDiscipline.bind(null, id)} className="space-y-4">
              <DisciplineFields d={d} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={d.active} /> Actief
              </label>
              <SubmitButton>Opslaan</SubmitButton>
            </Form>
          ) : (
            <dl className="grid gap-2 text-sm">
              <dt className="font-medium">Manager</dt>
              <dd>{d.managerText ?? "—"}</dd>
              <dt className="font-medium">Andere namen</dt>
              <dd>{d.aliases.join(", ") || "—"}</dd>
            </dl>
          )}
        </section>
        <aside className="space-y-4">
          <section className="card">
            <h2 className="mb-2">Gekoppeld</h2>
            <ul className="divide-y divide-neutral-100 text-sm">
              {links.map(([k, v]) => (
                <li key={k} className="flex justify-between py-1.5">
                  <span>{k}</span>
                  <span className="tabular-nums">{v}</span>
                </li>
              ))}
            </ul>
          </section>
          {canEdit && (
            <section className="card print:hidden">
              <h2 className="mb-2">Verwijderen</h2>
              {used > 0 ? (
                <p className="text-sm text-neutral-600">
                  Dit bedrijfsonderdeel is gekoppeld en kan niet worden verwijderd. Zet het op &lsquo;niet actief&rsquo;.
                </p>
              ) : (
                <Form action={deleteDiscipline.bind(null, id)}>
                  <SubmitButton variant="secondary" confirm={`"${d.name}" verwijderen?`}>
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
