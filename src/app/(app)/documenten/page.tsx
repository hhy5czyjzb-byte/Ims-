import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { sharePointConfigured } from "@/lib/env";
import { daysUntil, formatDate } from "@/lib/format";
import { Badge, Disclosure, EmptyState, Field, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createManualDocument, syncSharePoint } from "./actions";
import { Form } from "@/components/form";

export const metadata = { title: "Documentbeheer" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string; sync?: string }> }) {
  const user = await requireUser();
  const { q, filter, sync } = await searchParams;
  const canEdit = can(user.role, "documents.edit");

  const soon = new Date(Date.now() + 30 * 86_400_000);
  const where: Prisma.DocumentWhereInput = {
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { documentNumber: { contains: q, mode: "insensitive" } }] } : {}),
    ...(filter === "revisie" ? { revisionDate: { lte: soon } } : {}),
    ...(filter === "ongekoppeld" ? { requirements: { none: {} }, processes: { none: {} }, processSteps: { none: {} } } : {}),
  };
  const documents = await prisma.document.findMany({
    where,
    orderBy: [{ documentNumber: "asc" }, { title: "asc" }],
    include: { _count: { select: { requirements: true, processes: true, processSteps: true } } },
    take: 500,
  });

  const syncResult = sync?.split("-").map(Number);

  return (
    <>
      <PageHeader
        title="Documentbeheer"
        description="De documenten staan in de SharePoint-bibliotheek IMS-documenten; dat is de enige bron. Hier koppel je documenten aan normeisen, processen en processtappen."
        actions={
          canEdit && sharePointConfigured ? (
            <Form action={syncSharePoint}>
              <SubmitButton variant="secondary">Synchroniseren met SharePoint</SubmitButton>
            </Form>
          ) : undefined
        }
      />

      {syncResult && (
        <div role="status" className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          SharePoint gesynchroniseerd: {syncResult[0]} nieuw, {syncResult[1]} bijgewerkt, {syncResult[2]} niet meer gevonden.
        </div>
      )}

      {canEdit && (
        <div className="mb-6">
          <Disclosure summary={sharePointConfigured ? "Document handmatig registreren" : "Document registreren (SharePoint-koppeling nog niet actief)"}>
            <p className="mb-3 text-sm text-neutral-600">Plak de link naar het document in SharePoint. Er wordt geen kopie opgeslagen.</p>
            <Form action={createManualDocument} className="grid gap-3 md:grid-cols-4">
              <Field label="Documentnummer">
                <input name="documentNumber" className="input" placeholder="PR-001" />
              </Field>
              <Field label="Titel" className="md:col-span-3">
                <input name="title" required maxLength={300} className="input" />
              </Field>
              <Field label="Link naar SharePoint" className="md:col-span-4">
                <input name="webUrl" type="url" required pattern="https://.*" className="input" placeholder="https://rouwmaat.sharepoint.com/sites/…" />
              </Field>
              <Field label="Status">
                <input name="status" className="input" placeholder="Vrijgegeven" />
              </Field>
              <Field label="Versie">
                <input name="version" className="input" placeholder="1.0" />
              </Field>
              <Field label="Eigenaar">
                <input name="ownerName" className="input" />
              </Field>
              <Field label="Revisiedatum">
                <input name="revisionDate" type="date" className="input" />
              </Field>
              <div className="md:col-span-4">
                <SubmitButton>Registreren</SubmitButton>
              </div>
            </Form>
          </Disclosure>
        </div>
      )}

      <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <Field label="Zoeken">
          <input name="q" defaultValue={q} className="input w-72" placeholder="Titel of documentnummer" />
        </Field>
        <Field label="Filter">
          <select name="filter" defaultValue={filter ?? ""} className="input">
            <option value="">Alle documenten</option>
            <option value="revisie">Revisie binnen 30 dagen / verlopen</option>
            <option value="ongekoppeld">Nog nergens aan gekoppeld</option>
          </select>
        </Field>
        <button className="btn-secondary">Toepassen</button>
      </form>

      {documents.length === 0 ? (
        <EmptyState>Geen documenten gevonden.</EmptyState>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Titel</th>
                <th>Status</th>
                <th>Versie</th>
                <th>Eigenaar</th>
                <th>Revisiedatum</th>
                <th className="text-center">Koppelingen</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => {
                const days = d.revisionDate ? daysUntil(d.revisionDate) : null;
                const links = d._count.requirements + d._count.processes + d._count.processSteps;
                return (
                  <tr key={d.id} className={d.removedInSource ? "opacity-50" : ""}>
                    <td className="font-mono text-xs whitespace-nowrap">{d.documentNumber ?? "—"}</td>
                    <td>
                      <Link href={`/documenten/${d.id}`} className="font-medium">
                        {d.title}
                      </Link>
                      {d.removedInSource && <Badge className="ml-1 bg-neutral-200">Niet meer in SharePoint</Badge>}
                      {!d.sharePointItemId && <Badge className="ml-1 bg-amber-50 text-amber-800">Handmatig</Badge>}
                    </td>
                    <td>{d.status ?? "—"}</td>
                    <td>{d.version ?? "—"}</td>
                    <td>{d.ownerName ?? "—"}</td>
                    <td className="whitespace-nowrap">
                      {formatDate(d.revisionDate)}
                      {days !== null && days < 0 && <Badge className="ml-1 bg-red-100 text-brand-red-dark">Verlopen</Badge>}
                      {days !== null && days >= 0 && days <= 30 && <Badge className="ml-1 bg-amber-100 text-amber-800">Binnenkort</Badge>}
                    </td>
                    <td className={`text-center tabular-nums ${links === 0 ? "text-brand-red" : ""}`}>{links}</td>
                    <td>
                      <a href={d.webUrl} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap text-xs">
                        Openen ↗
                      </a>
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
