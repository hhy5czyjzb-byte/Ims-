import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { formatDate, toDateInput } from "@/lib/format";
import { ACTION_STATUS_CLASS, ACTION_STATUS_LABEL } from "@/lib/labels";
import { safeSlideData, SLIDE_LAYOUT_LABEL, type ContentData, type SlideLayout } from "@/lib/review-model";
import { SLIDE_PRESETS } from "@/lib/review-presets";
import { Badge, Disclosure, Field, PageHeader } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { SlidePreview } from "@/components/review/slide-preview";
import { ReviewDownloadButton } from "@/components/review/review-download-button";
import {
  addSlide,
  approveReview,
  createReviewAction,
  deleteReview,
  deleteSlide,
  duplicateSlide,
  moveSlide,
  refreshFromIms,
  reopenReview,
  toggleSlideHidden,
  updateReviewMeta,
} from "../actions";

export const metadata = { title: "Directiebeoordeling" };

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const review = await prisma.managementReview.findUnique({
    where: { id },
    include: {
      slides: { orderBy: { order: "asc" } },
      approvedBy: { select: { name: true } },
      actions: { orderBy: { number: "asc" }, include: { owner: { select: { name: true } } } },
    },
  });
  if (!review) notFound();
  await logAudit({ user, action: "VIEW", entityType: "ManagementReview", entityId: id });
  const approved = review.status === "APPROVED";
  const canEdit = can(user.role, "review.edit") && !approved;
  const users = canEdit ? await prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [];

  // Besluiten en openstaande punten op de dia's (besluitenblokken en vinkvakken) → voorstel voor acties.
  const actionTitles = new Set(review.actions.map((a) => a.title.trim().toLowerCase()));
  const proposals = review.slides.flatMap((s) => {
    if (s.layout !== "CONTENT" || s.hidden) return [];
    const d = safeSlideData("CONTENT", s.data) as ContentData;
    return d.elements.flatMap((e) =>
      e.type === "decisions" ? e.items.map((t) => ({ text: t, slide: s.title })) : e.type === "check" && !e.source ? [{ text: e.text, slide: s.title }] : [],
    );
  });
  const openProposals = proposals.filter((p) => p.text.trim() && !actionTitles.has(p.text.trim().slice(0, 300).toLowerCase()));
  const imsCount = review.slides.reduce((n, s) => {
    if (s.layout !== "CONTENT") return n;
    return n + (safeSlideData("CONTENT", s.data) as ContentData).elements.filter((e) => "source" in e && e.source).length;
  }, 0);

  return (
    <>
      <PageHeader
        title={review.title}
        description={
          <>
            Beoordelingsjaar {review.year} · {review.slides.length} dia&apos;s
            {review.meetingDate && <> · vergadering {formatDate(review.meetingDate)}</>} ·{" "}
            {approved ? (
              <Badge className="bg-green-100 text-green-800">
                Vastgesteld {formatDate(review.approvedAt)}
                {review.approvedBy ? ` door ${review.approvedBy.name}` : ""}
              </Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-900">Concept</Badge>
            )}
          </>
        }
        breadcrumb={[{ href: "/directiebeoordeling", label: "Directiebeoordeling" }]}
        actions={
          <>
            <ReviewDownloadButton reviewId={review.id} />
            {canEdit && imsCount > 0 && (
              <Form action={refreshFromIms.bind(null, review.id)}>
                <SubmitButton
                  variant="secondary"
                  confirm={`${imsCount} onderdelen met cijfers uit het IMS opnieuw vullen? Handmatige wijzigingen in die onderdelen worden overschreven.`}
                >
                  Cijfers bijwerken uit IMS
                </SubmitButton>
              </Form>
            )}
          </>
        }
      />

      {approved ? (
        <p className="mb-4 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
          Deze directiebeoordeling is vastgesteld en blijft ongewijzigd als bewijs. Voor een nieuwe versie of het volgende jaar: maak een nieuwe
          directiebeoordeling op basis van deze (op het overzicht).
          {can(user.role, "review.edit") && (
            <Form action={reopenReview.bind(null, review.id)} className="mt-2">
              <SubmitButton variant="link" confirm="Vaststelling intrekken en weer bewerkbaar maken?">
                Vaststelling intrekken
              </SubmitButton>
            </Form>
          )}
        </p>
      ) : (
        can(user.role, "review.approve") && (
          <Disclosure compact summary="Vaststellen door de directie">
            <Form action={approveReview.bind(null, review.id)} className="mt-2 flex flex-wrap items-end gap-3">
              <Field label="Datum vergadering">
                <input type="date" name="meetingDate" className="input" defaultValue={toDateInput(review.meetingDate ?? new Date())} />
              </Field>
              <SubmitButton confirm="Directiebeoordeling vaststellen? Daarna is hij niet meer te wijzigen.">Vaststellen</SubmitButton>
            </Form>
          </Disclosure>
        )
      )}

      {canEdit && (
        <div className="mt-3">
          <Disclosure compact summary="Gegevens (titel, jaar, voettekst)">
            <Form key={review.updatedAt.toISOString()} action={updateReviewMeta.bind(null, review.id)} className="mt-2 grid gap-3 sm:grid-cols-4">
              <Field label="Titel" className="sm:col-span-2">
                <input name="title" required className="input" defaultValue={review.title} />
              </Field>
              <Field label="Beoordelingsjaar">
                <input name="year" type="number" required className="input" defaultValue={review.year} />
              </Field>
              <Field label="Datum vergadering">
                <input name="meetingDate" type="date" className="input" defaultValue={toDateInput(review.meetingDate)} />
              </Field>
              <Field label="Voettekst op de inhoudsdia's" className="sm:col-span-4">
                <input name="footerText" className="input" defaultValue={review.footerText ?? ""} />
              </Field>
              <Field label="Notities (alleen in de app)" className="sm:col-span-4">
                <textarea name="notes" rows={2} className="input" defaultValue={review.notes ?? ""} />
              </Field>
              <div className="flex gap-3">
                <SubmitButton>Opslaan</SubmitButton>
              </div>
            </Form>
            <Form action={deleteReview.bind(null, review.id)} className="mt-3">
              <SubmitButton variant="link" confirm={`"${review.title}" met alle dia's verwijderen?`}>
                Directiebeoordeling verwijderen
              </SubmitButton>
            </Form>
          </Disclosure>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {review.slides.map((s, i) => {
          const number = s.layout === "CONTENT" || s.layout === "CHAPTER" ? i + 1 : undefined;
          const href = `/directiebeoordeling/${review.id}/dia/${s.id}`;
          return (
            <div key={s.id} className={`card p-0 break-inside-avoid ${s.hidden ? "opacity-50" : ""}`}>
              <Link href={href} className="block overflow-hidden rounded-t" title={canEdit ? "Bewerken" : "Bekijken"}>
                <div className="pointer-events-none">
                  <SlidePreview slide={s} review={review} number={number} />
                </div>
              </Link>
              <div className="flex items-start justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    <span className="text-neutral-400">{i + 1}.</span> {s.title || SLIDE_LAYOUT_LABEL[s.layout as SlideLayout]}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {SLIDE_LAYOUT_LABEL[s.layout as SlideLayout] ?? s.layout}
                    {s.hidden && " · verborgen"}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 items-center gap-1 text-xs print:hidden">
                    <Link href={href} className="btn-link">
                      Bewerken
                    </Link>
                    <Form action={moveSlide.bind(null, s.id, "up")}>
                      <SubmitButton variant="link" className="text-xs">
                        ↑
                      </SubmitButton>
                    </Form>
                    <Form action={moveSlide.bind(null, s.id, "down")}>
                      <SubmitButton variant="link" className="text-xs">
                        ↓
                      </SubmitButton>
                    </Form>
                    <details className="relative">
                      <summary className="cursor-pointer list-none px-1 text-neutral-500">⋯</summary>
                      <div className="absolute right-0 z-10 mt-1 w-56 space-y-1 rounded border border-neutral-200 bg-white p-2 shadow">
                        <Form action={duplicateSlide.bind(null, s.id)}>
                          <SubmitButton variant="link" className="text-xs">
                            Kopiëren
                          </SubmitButton>
                        </Form>
                        <Form action={toggleSlideHidden.bind(null, s.id)}>
                          <SubmitButton variant="link" className="text-xs">
                            {s.hidden ? "Weer tonen" : "Verbergen"}
                          </SubmitButton>
                        </Form>
                        <Form action={addSlide.bind(null, review.id)} className="space-y-1 border-t border-neutral-100 pt-1">
                          <input type="hidden" name="after" value={i} />
                          <select name="preset" className="input py-1 text-xs" defaultValue="cards4">
                            {SLIDE_PRESETS.map((p) => (
                              <option key={p.key} value={p.key}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                          <SubmitButton variant="link" className="text-xs">
                            Nieuwe dia hierna
                          </SubmitButton>
                        </Form>
                        <Form action={deleteSlide.bind(null, s.id)} className="border-t border-neutral-100 pt-1">
                          <SubmitButton variant="link" className="text-xs text-brand-red" confirm={`Dia "${s.title}" verwijderen?`}>
                            Verwijderen
                          </SubmitButton>
                        </Form>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {canEdit && (
        <section className="card mt-6 max-w-2xl print:hidden">
          <h2 className="mb-2">Dia toevoegen</h2>
          <Form action={addSlide.bind(null, review.id)} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="after" value={-1} />
            <Field label="Soort dia">
              <select name="preset" className="input" defaultValue="cards4">
                <optgroup label="Opmaak">
                  {SLIDE_PRESETS.filter((p) => !p.ims).map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Met cijfers uit het IMS">
                  {SLIDE_PRESETS.filter((p) => p.ims).map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label.replace(/^Uit IMS: /, "")}
                    </option>
                  ))}
                </optgroup>
              </select>
            </Field>
            <SubmitButton variant="secondary">Toevoegen aan het eind</SubmitButton>
          </Form>
        </section>
      )}

      <section className="card mt-6">
        <h2 className="mb-1">Acties uit deze directiebeoordeling</h2>
        <p className="mb-3 text-sm text-neutral-600">
          Besluiten worden acties in de actielijst (bron: directiebeoordeling) en blijven open tot uitvoering en doeltreffendheid zijn geverifieerd.
        </p>
        {review.actions.length > 0 && (
          <table className="table mb-4">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Actie</th>
                <th>Eigenaar</th>
                <th>Deadline</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {review.actions.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap">
                    <Link href={`/acties/${a.id}`}>#{a.number}</Link>
                  </td>
                  <td>{a.title}</td>
                  <td>{a.owner?.name ?? a.ownerText ?? "—"}</td>
                  <td className="whitespace-nowrap">{formatDate(a.deadline)}</td>
                  <td>
                    <Badge className={ACTION_STATUS_CLASS[a.status]}>{ACTION_STATUS_LABEL[a.status]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {can(user.role, "review.edit") && (
          <>
            {openProposals.length > 0 && (
              <div className="mb-4">
                <h3 className="mb-1 text-sm font-semibold">Besluiten en punten op de dia&apos;s zonder actie</h3>
                <ul className="divide-y divide-neutral-100 text-sm">
                  {openProposals.map((p, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 py-1.5">
                      <span>
                        {p.text} <span className="text-xs text-neutral-400">({p.slide})</span>
                      </span>
                      <Form action={createReviewAction.bind(null, review.id)}>
                        <input type="hidden" name="title" value={p.text.slice(0, 300)} />
                        <SubmitButton variant="link" className="text-xs whitespace-nowrap">
                          → actie
                        </SubmitButton>
                      </Form>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Disclosure compact summary="Actie toevoegen">
              <Form resetOnSuccess action={createReviewAction.bind(null, review.id)} className="mt-2 grid gap-3 sm:grid-cols-4">
                <Field label="Actie / besluit" className="sm:col-span-4">
                  <input name="title" required maxLength={300} className="input" />
                </Field>
                <Field label="Eigenaar">
                  <select name="ownerId" className="input" defaultValue="">
                    <option value="">— Kies —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Of eigenaar (functie)">
                  <input name="ownerText" className="input" placeholder="Bijv. Directie" />
                </Field>
                <Field label="Deadline">
                  <input name="deadline" type="date" className="input" />
                </Field>
                <Field label="Prioriteit">
                  <select name="priority" className="input" defaultValue="MEDIUM">
                    <option value="HIGH">Hoog</option>
                    <option value="MEDIUM">Middel</option>
                    <option value="LOW">Laag</option>
                  </select>
                </Field>
                <div>
                  <SubmitButton>Actie aanmaken</SubmitButton>
                </div>
              </Form>
            </Disclosure>
          </>
        )}
      </section>
    </>
  );
}
