import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { SlidePreview } from "@/components/review/slide-preview";
import { SlideEditor } from "@/components/review/slide-editor";
import Link from "next/link";

export const metadata = { title: "Dia bewerken" };

export default async function SlidePage({ params }: { params: Promise<{ id: string; slideId: string }> }) {
  const { id, slideId } = await params;
  const user = await requireUser();
  const review = await prisma.managementReview.findUnique({
    where: { id },
    include: { slides: { orderBy: { order: "asc" }, select: { id: true } } },
  });
  const slide = await prisma.reviewSlide.findUnique({ where: { id: slideId } });
  if (!review || !slide || slide.reviewId !== id) notFound();
  const index = review.slides.findIndex((s) => s.id === slideId);
  const prev = review.slides[index - 1];
  const next = review.slides[index + 1];
  const base = `/directiebeoordeling/${id}`;
  const canEdit = can(user.role, "review.edit") && review.status !== "APPROVED";
  const images = canEdit ? await prisma.reviewImage.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, role: true, name: true } }) : [];

  return (
    <>
      <PageHeader
        title={`Dia ${index + 1}: ${slide.title || "zonder titel"}`}
        breadcrumb={[
          { href: "/directiebeoordeling", label: "Directiebeoordeling" },
          { href: base, label: review.title },
        ]}
        print={false}
      />
      {canEdit ? (
        <SlideEditor
          key={slide.id}
          slide={{ ...slide, updatedAt: slide.updatedAt.toISOString() }}
          review={review}
          images={images}
          number={index + 1}
          prevHref={prev ? `${base}/dia/${prev.id}` : null}
          nextHref={next ? `${base}/dia/${next.id}` : null}
          backHref={base}
        />
      ) : (
        <div className="max-w-5xl">
          <div className="overflow-hidden rounded border border-neutral-300">
            <SlidePreview slide={slide} review={review} number={index + 1} />
          </div>
          <div className="mt-3 flex gap-3">
            {prev && (
              <Link className="btn-secondary" href={`${base}/dia/${prev.id}`}>
                ← Vorige dia
              </Link>
            )}
            {next && (
              <Link className="btn-secondary" href={`${base}/dia/${next.id}`}>
                Volgende dia →
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
