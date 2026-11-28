import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { formatDate, formatDateTime, toDateInput } from "@/lib/format";
import { CONTEXT_STATUS_CLASS, CONTEXT_STATUS_LABEL } from "@/lib/labels";
import { Badge, EmptyState, Field, PageHeader } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { ContextNav } from "@/components/context-nav";
import { addUploadImage, beginContextUpload, deleteContextAnalysis, finishContextUpload, updateAnalysisMeta } from "../actions";
import { ContextUploadForm } from "@/components/context-upload-form";

export const metadata = { title: "Versies context- en stakeholderanalyse" };

export default async function ContextVersionsPage() {
  const user = await requireUser();
  const canEdit = can(user.role, "context.edit");
  const [versions, history] = await Promise.all([
    prisma.contextAnalysis.findMany({
      orderBy: { createdAt: "desc" },
      include: { uploadedBy: { select: { name: true } }, _count: { select: { sections: true, images: true } } },
    }),
    prisma.auditLog.findMany({
      where: { entityType: { in: ["ContextAnalysis", "ContextFactor", "Stakeholder", "StakeholderObligation"] }, action: { not: "VIEW" } },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { user: { select: { name: true } } },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Context en stakeholders"
        description="Het Word-document is de bron. Lees na elke herziening de nieuwe versie in: tekst en afbeeldingen worden per paragraaf getoond, en contextfactoren, stakeholders en verplichtingen worden bijgewerkt (koppelingen blijven staan)."
      />
      <ContextNav />

      {canEdit && (
        <section className="card mb-6">
          <h2 className="mb-1">Nieuwe versie inlezen</h2>
          <p className="mb-3 text-sm text-neutral-600">
            Gebruik in Word de kopstijlen (Kop 1 voor de samenvatting, Kop 2 voor paragrafen zoals &ldquo;3.1 …&rdquo;) en de vaste tabellen voor
            contextfactoren, stakeholders, verplichtingen en documentgegevens. Het document wordt in je browser omgezet; afbeeldingen tot 4 MB per stuk.
          </p>
          <ContextUploadForm begin={beginContextUpload} addImage={addUploadImage} finish={finishContextUpload} maxDate={toDateInput(new Date())} />
        </section>
      )}

      <section className="card mb-6">
        <h2 className="mb-3">Versies</h2>
        {versions.length === 0 ? (
          <EmptyState>Nog geen versies.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Versie</th>
                  <th>Status</th>
                  <th>Vastgesteld</th>
                  <th>Volgende herbeoordeling</th>
                  <th>Bestand</th>
                  <th className="text-right">Paragrafen</th>
                  <th className="text-right">Afbeeldingen</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <Link href={`/context?versie=${v.id}`}>{v.versionLabel ?? "—"}</Link>
                      <div className="text-xs text-neutral-500">{v.title}</div>
                    </td>
                    <td>
                      <Badge className={CONTEXT_STATUS_CLASS[v.status]}>{CONTEXT_STATUS_LABEL[v.status]}</Badge>
                    </td>
                    <td className="whitespace-nowrap">
                      {v.approvedAt ? formatDate(v.approvedAt) : "—"}
                      {v.approvedByText && v.approvedAt && <div className="text-xs text-neutral-500">{v.approvedByText}</div>}
                    </td>
                    <td className="whitespace-nowrap">{formatDate(v.nextReviewDate)}</td>
                    <td className="text-xs">
                      {v.fileName}
                      <div className="text-neutral-500">
                        {formatDateTime(v.createdAt)}
                        {v.uploadedBy && ` · ${v.uploadedBy.name}`}
                      </div>
                    </td>
                    <td className="text-right tabular-nums">
                      {v._count.sections === 0 ? <span className="text-xs text-amber-700">onvolledig</span> : v._count.sections}
                    </td>
                    <td className="text-right tabular-nums">{v._count.images}</td>
                    <td className="text-xs whitespace-nowrap">
                      {canEdit && (
                        <details>
                          <summary className="cursor-pointer text-brand-red-dark">Wijzigen</summary>
                          <Form key={v.updatedAt.toISOString()} action={updateAnalysisMeta.bind(null, v.id)} className="mt-2 grid w-72 gap-2">
                            <Field label="Versie">
                              <input name="versionLabel" defaultValue={v.versionLabel ?? ""} maxLength={100} className="input" />
                            </Field>
                            <Field label="Volgende herbeoordeling">
                              <input name="nextReviewDate" type="date" defaultValue={toDateInput(v.nextReviewDate)} className="input" />
                            </Field>
                            <Field label="Link naar SharePoint">
                              <input name="sharepointUrl" type="url" pattern="https://.*" defaultValue={v.sharepointUrl ?? ""} className="input" />
                            </Field>
                            <SubmitButton variant="secondary">Opslaan</SubmitButton>
                          </Form>
                          {v.status !== "APPROVED" && (
                            <Form action={deleteContextAnalysis.bind(null, v.id)} className="mt-2">
                              <SubmitButton variant="link" confirm="Deze versie met tekst en afbeeldingen verwijderen?">
                                Versie verwijderen
                              </SubmitButton>
                            </Form>
                          )}
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="mb-2">Historie</h2>
        {history.length === 0 ? (
          <p className="text-sm text-neutral-500">Geen wijzigingen.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {history.map((h) => (
              <li key={h.id}>
                <span className="text-neutral-500">{formatDateTime(h.createdAt)}</span> — {h.user?.name ?? h.userEmail ?? "Systeem"}: {h.summary}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
