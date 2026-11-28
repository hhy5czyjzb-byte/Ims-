import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { Badge, Disclosure, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { Form } from "@/components/form";
import { createMasterData } from "../actions";
import { BeheerNav } from "../beheer-nav";
import { DisciplineFields } from "../discipline-fields";

export const metadata = { title: "Bedrijfsonderdelen" };

export default async function DisciplinesPage() {
  const user = await requireUser();
  const canEdit = can(user.role, "masterdata.edit");
  const disciplines = await prisma.discipline.findMany({
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { actions: true, risks: true, legalRequirements: true, environmentalAspects: true, reports: true, processes: true } } },
  });
  return (
    <>
      <PageHeader title="Stamgegevens" description="Bedrijfsonderdelen (BU's / disciplines). Leeg op een registerregel betekent: geldt voor de hele groep." />
      <BeheerNav active="/beheer/bedrijfsonderdelen" />
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Bedrijfsonderdeel</th>
              <th>Manager</th>
              <th>Andere namen</th>
              <th className="text-right">Acties</th>
              <th className="text-right">Risico&apos;s</th>
              <th className="text-right">Wetgeving</th>
              <th className="text-right">Aspecten</th>
              <th className="text-right">Meldingen</th>
              <th className="text-right">Processen</th>
            </tr>
          </thead>
          <tbody>
            {disciplines.map((d) => (
              <tr key={d.id} className={d.active ? "" : "text-neutral-400"}>
                <td>
                  <Link href={`/beheer/bedrijfsonderdelen/${d.id}`} className="font-medium">
                    {d.name}
                  </Link>
                  {!d.active && <Badge className="ml-2 bg-neutral-100 text-neutral-500">niet actief</Badge>}
                  {d.description && <span className="block text-xs text-neutral-500">{d.description}</span>}
                </td>
                <td>{d.managerText ?? "—"}</td>
                <td className="text-xs text-neutral-600">{d.aliases.join(", ") || "—"}</td>
                <td className="text-right tabular-nums">{d._count.actions > 0 ? <Link href={`/acties?discipline=${d.id}`}>{d._count.actions}</Link> : 0}</td>
                <td className="text-right tabular-nums">{d._count.risks}</td>
                <td className="text-right tabular-nums">{d._count.legalRequirements}</td>
                <td className="text-right tabular-nums">{d._count.environmentalAspects}</td>
                <td className="text-right tabular-nums">{d._count.reports}</td>
                <td className="text-right tabular-nums">{d._count.processes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <section className="card mt-6 print:hidden">
          <Disclosure summary="Nieuw bedrijfsonderdeel toevoegen">
            <Form resetOnSuccess action={createMasterData.bind(null, "discipline")} className="mt-3 space-y-3">
              <DisciplineFields />
              <SubmitButton>Toevoegen</SubmitButton>
            </Form>
          </Disclosure>
        </section>
      )}
    </>
  );
}
