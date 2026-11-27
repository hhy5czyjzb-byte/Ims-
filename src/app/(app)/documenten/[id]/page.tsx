import Link from "next/link";
import { notFound } from "next/navigation";
import { getGraphAccessToken, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { can } from "@/lib/rbac";
import { getRequirementOptions } from "@/lib/lookups";
import { getPreviewUrl } from "@/lib/graph";
import { formatDate, formatDateTime, toDateInput } from "@/lib/format";
import { Badge, Disclosure, Field, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { CheckboxPicker } from "@/components/checkbox-picker";
import { LegalLinkItems, legalLinkSelect } from "@/components/legal-links";
import { deleteDocument, setDocumentLinks, updateManualDocument } from "../actions";
import { Form } from "@/components/form";

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const doc = await prisma.document.findUnique({
    where: { id },
    include: {
      requirements: { include: { norm: true } },
      legalRequirements: { select: legalLinkSelect, orderBy: [{ externalRef: "asc" }, { number: "asc" }] },
      processes: { orderBy: { name: "asc" } },
      processSteps: { include: { process: true } },
    },
  });
  if (!doc) notFound();
  await logAudit({ user, action: "VIEW", entityType: "Document", entityId: id });

  const canEdit = can(user.role, "documents.edit");

  // Voorbeeld via Graph (met de rechten van de gebruiker); stil overslaan als dat niet kan.
  let previewUrl: string | null = null;
  if (doc.sharePointItemId && doc.sharePointDriveId) {
    const token = await getGraphAccessToken();
    if (token) previewUrl = await getPreviewUrl(token, doc.sharePointDriveId, doc.sharePointItemId).catch(() => null);
  }

  const [requirementGroups, processes] = canEdit
    ? await Promise.all([
        getRequirementOptions(),
        prisma.process.findMany({ where: { active: true }, orderBy: { name: "asc" }, include: { steps: { orderBy: { sortOrder: "asc" } } } }),
      ])
    : [[], []];

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/documenten", label: "Documentbeheer" }]}
        title={doc.title}
        description={doc.documentNumber ?? undefined}
        actions={
          <a href={doc.webUrl} target="_blank" rel="noopener noreferrer" className="btn">
            Openen in SharePoint ↗
          </a>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card text-sm">
          <h2 className="mb-3">Gegevens</h2>
          <dl className="grid grid-cols-[8rem_1fr] gap-y-1.5">
            <dt className="text-neutral-500">Status</dt>
            <dd>{doc.status ?? "—"}</dd>
            <dt className="text-neutral-500">Versie</dt>
            <dd>{doc.version ?? "—"}</dd>
            <dt className="text-neutral-500">Eigenaar</dt>
            <dd>{doc.ownerName ?? "—"}</dd>
            <dt className="text-neutral-500">Revisiedatum</dt>
            <dd>{formatDate(doc.revisionDate)}</dd>
            <dt className="text-neutral-500">Laatst gewijzigd</dt>
            <dd>{formatDateTime(doc.lastModifiedAt)}</dd>
            <dt className="text-neutral-500">Bron</dt>
            <dd>
              {doc.sharePointItemId ? (
                <>SharePoint (sync {formatDateTime(doc.lastSyncedAt)})</>
              ) : (
                <Badge className="bg-amber-50 text-amber-800">Handmatig geregistreerd</Badge>
              )}
            </dd>
          </dl>
          {doc.removedInSource && <p className="mt-3 text-brand-red">Dit document is bij de laatste synchronisatie niet meer gevonden in SharePoint.</p>}
        </div>

        <div className="card lg:col-span-2">
          <h2 className="mb-3">Gekoppeld aan</h2>
          <div className="grid gap-4 text-sm md:grid-cols-2">
            <div>
              <h3 className="mb-1 font-semibold">Normeisen ({doc.requirements.length})</h3>
              {doc.requirements.length === 0 ? (
                <p className="text-neutral-500">Nog geen normeisen.</p>
              ) : (
                <ul className="space-y-1">
                  {doc.requirements.map((r) => (
                    <li key={r.id}>
                      <Link href={`/normen/${r.normId}/eisen/${r.id}`}>
                        <Badge className="mr-1 bg-brand-grey-light text-neutral-900">{r.norm.code}</Badge>
                        {r.clause} {r.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="mb-1 font-semibold">Processen en stappen ({doc.processes.length + doc.processSteps.length})</h3>
              {doc.processes.length + doc.processSteps.length === 0 ? (
                <p className="text-neutral-500">Nog geen processen.</p>
              ) : (
                <ul className="space-y-1">
                  {doc.processes.map((p) => (
                    <li key={p.id}>
                      <Link href={`/processen/${p.id}`}>{p.name}</Link>
                    </li>
                  ))}
                  {doc.processSteps.map((s) => (
                    <li key={s.id}>
                      <Link href={`/processen/${s.processId}?stap=${s.id}`}>
                        {s.process.name} › {s.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {doc.legalRequirements.length > 0 && (
            <div className="mt-4 text-sm">
              <h3 className="mb-1 font-semibold">Wet- en regelgeving ({doc.legalRequirements.length})</h3>
              <ul className="space-y-1">
                <LegalLinkItems items={doc.legalRequirements} />
              </ul>
            </div>
          )}
        </div>
      </div>

      {previewUrl && (
        <div className="card mt-4 p-0">
          <iframe
            src={previewUrl}
            title={`Voorbeeld ${doc.title}`}
            className="h-[70vh] w-full rounded-lg"
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        </div>
      )}

      {canEdit && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Disclosure summary="Koppelingen wijzigen">
            <Form action={setDocumentLinks.bind(null, id)} className="space-y-3">
              <Field label="Normeisen" group>
                <CheckboxPicker
                  name="requirementIds"
                  groups={requirementGroups.map((g) => ({ label: g.norm, options: g.options }))}
                  selected={doc.requirements.map((r) => r.id)}
                />
              </Field>
              <Field label="Processen" group>
                <CheckboxPicker
                  name="processIds"
                  groups={[{ label: "Processen", options: processes.map((p) => ({ value: p.id, label: p.name })) }]}
                  selected={doc.processes.map((p) => p.id)}
                  height="8rem"
                />
              </Field>
              <Field label="Processtappen" group>
                <CheckboxPicker
                  name="stepIds"
                  groups={processes
                    .filter((p) => p.steps.length)
                    .map((p) => ({ label: p.name, options: p.steps.map((s, i) => ({ value: s.id, label: `${i + 1}. ${s.name}` })) }))}
                  selected={doc.processSteps.map((s) => s.id)}
                  height="10rem"
                />
              </Field>
              <SubmitButton>Koppelingen opslaan</SubmitButton>
            </Form>
          </Disclosure>

          <Disclosure summary={doc.sharePointItemId ? "Verwijzing verwijderen" : "Gegevens wijzigen"}>
            {!doc.sharePointItemId && (
              <Form action={updateManualDocument.bind(null, id)} className="grid gap-3 sm:grid-cols-2">
                <Field label="Documentnummer">
                  <input name="documentNumber" defaultValue={doc.documentNumber ?? ""} className="input" />
                </Field>
                <Field label="Titel">
                  <input name="title" required defaultValue={doc.title} className="input" />
                </Field>
                <Field label="Link naar SharePoint" className="sm:col-span-2">
                  <input name="webUrl" type="url" required pattern="https://.*" defaultValue={doc.webUrl} className="input" />
                </Field>
                <Field label="Status">
                  <input name="status" defaultValue={doc.status ?? ""} className="input" />
                </Field>
                <Field label="Versie">
                  <input name="version" defaultValue={doc.version ?? ""} className="input" />
                </Field>
                <Field label="Eigenaar">
                  <input name="ownerName" defaultValue={doc.ownerName ?? ""} className="input" />
                </Field>
                <Field label="Revisiedatum">
                  <input name="revisionDate" type="date" defaultValue={toDateInput(doc.revisionDate)} className="input" />
                </Field>
                <div className="sm:col-span-2">
                  <SubmitButton>Opslaan</SubmitButton>
                </div>
              </Form>
            )}
            {doc.sharePointItemId && (
              <p className="text-sm text-neutral-600">Status, versie, eigenaar en revisiedatum komen uit SharePoint en wijzig je daar.</p>
            )}
            <Form action={deleteDocument.bind(null, id)} className="mt-4 border-t border-neutral-200 pt-3">
              <SubmitButton variant="link" confirm="Verwijzing verwijderen? Het bestand in SharePoint blijft bestaan, maar alle koppelingen vervallen.">
                Verwijzing verwijderen
              </SubmitButton>
            </Form>
          </Disclosure>
        </div>
      )}
    </>
  );
}
