import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { Form } from "@/components/form";
import { deleteLocation, updateLocation } from "../../actions";
import { LocationFields } from "../../location-fields";

export const metadata = { title: "Vestiging" };

export default async function LocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const canEdit = can(user.role, "masterdata.edit");
  const l = await prisma.location.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          actions: true,
          risks: true,
          legalRequirements: true,
          environmentalAspects: true,
          reports: true,
          audits: true,
          locationAudits: true,
          equipment: true,
          energyConsumptions: true,
        },
      },
    },
  });
  if (!l) notFound();
  await logAudit({ user, action: "VIEW", entityType: "Location", entityId: id });
  const c = l._count;
  const links: { label: string; n: number; href?: string }[] = [
    { label: "Acties", n: c.actions, href: `/acties?locatie=${id}` },
    { label: "Risico's en kansen", n: c.risks },
    { label: "Wettelijke eisen", n: c.legalRequirements },
    { label: "Milieuaspecten", n: c.environmentalAspects },
    { label: "Meldingen", n: c.reports },
    { label: "Audits", n: c.audits },
    { label: "Compliance-audits", n: c.locationAudits, href: "/wetgeving/vestigingen" },
    { label: "Materieel", n: c.equipment },
    { label: "Energieverbruik (regels)", n: c.energyConsumptions },
  ];
  const used = links.reduce((n, x) => n + x.n, 0);

  return (
    <>
      <PageHeader
        title={l.name}
        description={[l.kind, l.city].filter(Boolean).join(" · ") || undefined}
        breadcrumb={[
          { href: "/beheer", label: "Stamgegevens" },
          { href: "/beheer/vestigingen", label: "Vestigingen" },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          {canEdit ? (
            <Form key={l.updatedAt.toISOString()} action={updateLocation.bind(null, id)} className="space-y-4">
              <LocationFields l={l} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={l.active} /> Actief (inactieve vestigingen verdwijnen uit keuzelijsten)
              </label>
              <SubmitButton>Opslaan</SubmitButton>
            </Form>
          ) : (
            <dl className="grid gap-2 text-sm">
              {[
                ["Adres", [l.address, l.postalCode, l.city].filter(Boolean).join(", ")],
                ["Manager", l.managerText],
                ["Activiteiten", l.activities],
                ["Vergunningen", l.permitInfo],
                ["Energiebesparingsplicht", l.energySavingObligation],
                ["Opmerkingen", l.notes],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="font-medium">{k}</dt>
                  <dd className="whitespace-pre-line text-neutral-700">{v || "—"}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
        <aside className="space-y-4">
          <section className="card">
            <h2 className="mb-2">Gekoppeld aan deze vestiging</h2>
            <ul className="divide-y divide-neutral-100 text-sm">
              {links.map((x) => (
                <li key={x.label} className="flex justify-between py-1.5">
                  {x.href && x.n > 0 ? <Link href={x.href}>{x.label}</Link> : <span>{x.label}</span>}
                  <span className="tabular-nums">{x.n}</span>
                </li>
              ))}
            </ul>
          </section>
          {canEdit && (
            <section className="card print:hidden">
              <h2 className="mb-2">Verwijderen</h2>
              {used > 0 ? (
                <p className="text-sm text-neutral-600">
                  Deze vestiging is gekoppeld en kan niet worden verwijderd. Zet hem op &lsquo;niet actief&rsquo;; de historie blijft dan bewaard.
                </p>
              ) : (
                <Form action={deleteLocation.bind(null, id)}>
                  <SubmitButton variant="secondary" confirm={`Vestiging "${l.name}" verwijderen?`}>
                    Vestiging verwijderen
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
