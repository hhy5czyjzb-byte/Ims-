"use client";

import { useState } from "react";
import { getReviewExport } from "@/app/(app)/directiebeoordeling/actions";
import { reviewImageSrc } from "@/components/review/slide-preview";
import { slideImageIds } from "@/lib/review-model";

async function toDataUrl(id: string): Promise<string | null> {
  const res = await fetch(reviewImageSrc(id));
  if (!res.ok) return null;
  const blob = await res.blob();
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:/, ""));
    r.onerror = () => resolve(null);
    r.readAsDataURL(blob);
  });
}

/** PowerPoint maken in de browser (bewerkbaar, in de opmaak van het template) en downloaden. */
export function ReviewDownloadButton({
  reviewId,
  label = "PowerPoint downloaden",
  className = "btn",
}: {
  reviewId: string;
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    try {
      setBusy("Gegevens ophalen…");
      const review = await getReviewExport(reviewId);
      if (!review) throw new Error("Niet gevonden.");
      const ids = new Set<string>();
      if (review.logoImageId) ids.add(review.logoImageId);
      if (review.stripImageId) ids.add(review.stripImageId);
      for (const s of review.slides) if (!s.hidden) slideImageIds(s).forEach((i) => ids.add(i));
      const images: Record<string, string> = {};
      let n = 0;
      for (const id of ids) {
        setBusy(`Afbeeldingen… ${++n} van ${ids.size}`);
        const d = await toDataUrl(id);
        if (d) images[id] = d;
      }
      setBusy("PowerPoint maken…");
      const [{ default: Pptx }, { default: JSZip }, { buildReviewPptx, dedupeMedia }] = await Promise.all([
        import("pptxgenjs"),
        import("jszip"),
        import("@/lib/review-pptx-export"),
      ]);
      const pptx = buildReviewPptx(Pptx, review, images);
      const raw = (await pptx.write({ outputType: "uint8array" })) as Uint8Array;
      const bytes = await dedupeMedia(JSZip, raw);
      const blob = new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${review.title.replace(/[\\/:*?"<>|]+/g, "-")}.pptx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      console.error(e);
      setError("PowerPoint maken mislukt. Probeer het opnieuw.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <span className="inline-flex flex-col">
      <button type="button" className={className} onClick={run} disabled={!!busy}>
        {busy ?? label}
      </button>
      {error && <span className="mt-1 text-xs text-brand-red">{error}</span>}
    </span>
  );
}
