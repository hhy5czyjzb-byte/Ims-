import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { formatDate } from "@/lib/format";
import { Badge, EmptyState, Field, PageHeader } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { SlidePreview } from "@/components/review/slide-preview";
import { createReview } from "./actions";

export const metadata = { title: "Directiebeoordeling" };

export default async function ReviewsPage() {
  const user = await requireUser();
  const canEdit = can(user.role, "review.edit");
  const reviews = await prisma.managementReview.findMany({
    orderBy: [{ year: "desc" }, { createdAt: "desc" }],
    include: { slides: { where: { order: 0 }, take: 1 }, approvedBy: { select: { name: true } }, _count: { select: { slides: true, actions: true } } },
  });
  const latest = reviews[0];
  const nextYear = latest ? latest.year + 1 : new Date().getFullYear() - 1;

  return (
    <>
      <PageHeader
        title="Directiebeoordeling"
        description="Managementreview in de opmaak van het eigen PowerPoint-template. Per dia te bewerken, met cijfers uit het IMS, en als bewerkbare PowerPoint te downloaden."
        actions={
          canEdit ? (
            <Link href="/directiebeoordeling/import" className="btn-secondary">
              PowerPoint-template inlezen
            </Link>
          ) : undefined
        }
      />

      {reviews.length === 0 ? (
        <EmptyState>
          Nog geen directiebeoordeling. Lees je bestaande managementreview (PowerPoint) in als basis: dan blijven opbouw, foto&apos;s en opmaak precies gelijk.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {reviews.map((r) => (
            <Link key={r.id} href={`/directiebeoordeling/${r.id}`} className="card block p-0 no-underline hover:border-brand-red">
              {r.slides[0] && (
                <div className="pointer-events-none overflow-hidden rounded-t">
                  <SlidePreview slide={r.slides[0]} review={r} />
                </div>
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-neutral-900">{r.title}</h2>
                  {r.status === "APPROVED" ? (
                    <Badge className="bg-green-100 text-green-800">Vastgesteld</Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-900">Concept</Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-neutral-600">
                  Beoordelingsjaar {r.year} · {r._count.slides} dia&apos;s{r._count.actions ? ` · ${r._count.actions} acties` : ""}
                </p>
                <p className="text-xs text-neutral-500">
                  {r.status === "APPROVED"
                    ? `Vastgesteld ${formatDate(r.approvedAt)}${r.approvedBy ? ` door ${r.approvedBy.name}` : ""}`
                    : `Laatst gewijzigd ${formatDate(r.updatedAt)}`}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {canEdit && (
        <section className="card mt-6 max-w-3xl print:hidden">
          <h2 className="mb-1">Nieuwe directiebeoordeling</h2>
          <p className="mb-3 text-sm text-neutral-600">
            Kies een eerdere review als basis: alle dia&apos;s worden gekopieerd en je werkt ze bij (cijfers uit het IMS met één klik). Zonder basis krijg je
            een standaardopbouw.
          </p>
          <Form action={createReview} className="grid gap-3 sm:grid-cols-3">
            <Field label="Titel" className="sm:col-span-2">
              <input name="title" required className="input" defaultValue={`Managementreview ${nextYear}`} />
            </Field>
            <Field label="Beoordelingsjaar">
              <input name="year" type="number" min={2000} max={2100} required className="input" defaultValue={nextYear} />
            </Field>
            <Field label="Op basis van" className="sm:col-span-2">
              <select name="basedOnId" className="input" defaultValue={latest?.id ?? ""}>
                <option value="">Standaardopbouw (leeg, met IMS-dia&apos;s)</option>
                {reviews.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Datum vergadering">
              <input name="meetingDate" type="date" className="input" />
            </Field>
            <Field label="Voettekst op de dia's" className="sm:col-span-3">
              <input name="footerText" className="input" placeholder={`Managementreview ${nextYear}`} />
            </Field>
            <div>
              <SubmitButton>Aanmaken</SubmitButton>
            </div>
          </Form>
        </section>
      )}
    </>
  );
}
