import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { Badge, Disclosure, EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { Form } from "@/components/form";
import { createMasterData } from "../actions";
import { BeheerNav } from "../beheer-nav";
import { LocationFields } from "../location-fields";

export const metadata = { title: "Vestigingen" };

export default async function LocationsPage() {
  const user = await requireUser();
  const canEdit = can(user.role, "masterdata.edit");
  const locations = await prisma.location.findMany({
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: { actions: true, risks: true, legalRequirements: true, environmentalAspects: true, reports: true, locationAudits: true, audits: true },
      },
    },
  });
  const missingAddress = locations.filter((l) => l.active && !l.address).length;

  return (
    <>
      <PageHeader
        title="Stamgegevens"
        description="Vestigingen komen terug bij acties, risico's, wetgeving, milieuaspecten, meldingen, audits en CO2."
        actions={
          canEdit ? (
            <Link href="/beheer/vestigingen-import" className="btn-secondary">
              Importeren uit Excel
            </Link>
          ) : undefined
        }
      />
      <BeheerNav active="/beheer/vestigingen" />
      {missingAddress > 0 && (
        <p className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Bij {missingAddress} actieve vestiging(en) ontbreekt nog een adres. Klik op een naam om het aan te vullen.
        </p>
      )}
      {locations.length === 0 ? (
        <EmptyState>Nog geen vestigingen.</EmptyState>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Vestiging</th>
                <th>Soort</th>
                <th>Adres</th>
                <th>Manager</th>
                <th>Energiebesparingsplicht</th>
                <th className="text-right" title="Acties, risico's, wettelijke eisen, milieuaspecten, meldingen en audits">
                  Gekoppeld
                </th>
              </tr>
            </thead>
            <tbody>
              {locations.map((l) => {
                const linked = Object.values(l._count).reduce((n, v) => n + v, 0);
                return (
                  <tr key={l.id} className={l.active ? "" : "text-neutral-400"}>
                    <td>
                      <Link href={`/beheer/vestigingen/${l.id}`} className="font-medium">
                        {l.name}
                      </Link>
                      {!l.active && <Badge className="ml-2 bg-neutral-100 text-neutral-500">niet actief</Badge>}
                    </td>
                    <td>{l.kind ?? "—"}</td>
                    <td>
                      {[l.address, [l.postalCode, l.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || (
                        <span className="text-amber-700">ontbreekt</span>
                      )}
                    </td>
                    <td>{l.managerText ?? "—"}</td>
                    <td>{l.energySavingObligation ?? "—"}</td>
                    <td className="text-right tabular-nums">{linked}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {canEdit && (
        <section className="card mt-6 print:hidden">
          <Disclosure summary="Nieuwe vestiging toevoegen">
            <Form resetOnSuccess action={createMasterData.bind(null, "location")} className="mt-3 space-y-3">
              <LocationFields />
              <SubmitButton>Toevoegen</SubmitButton>
            </Form>
          </Disclosure>
        </section>
      )}
    </>
  );
}
