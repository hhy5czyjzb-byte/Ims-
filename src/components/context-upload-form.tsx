"use client";

import { useState } from "react";
import { Field } from "@/components/ui";

type Props = {
  begin: (fileName: string) => Promise<{ error?: string; id?: string }>;
  addImage: (analysisId: string, fd: FormData) => Promise<{ error?: string; src?: string }>;
  finish: (analysisId: string, fd: FormData) => Promise<{ error?: string } | void>;
  maxDate: string;
};

const MAX_IMAGE = 4 * 1024 * 1024;

/**
 * Word-document inlezen: omzetten in de browser, afbeeldingen één voor één versturen, daarna de tekst.
 * Elk verzoek blijft zo klein genoeg voor de hosting (max. 4,5 MB per verzoek).
 */
export function ContextUploadForm({ begin, addImage, finish, maxDate }: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("file");
    setError(null);
    if (!(file instanceof File) || file.size === 0) return setError("Kies het Word-bestand (.docx).");
    if (!/\.docx$/i.test(file.name)) return setError("Alleen Word-bestanden (.docx) kunnen worden ingelezen.");
    setBusy(true);
    try {
      setStatus("Document omzetten…");
      const mammoth = (await import("mammoth")).default;
      const images: { blob: Blob; alt: string }[] = [];
      const converted = await mammoth.convertToHtml(
        { arrayBuffer: await file.arrayBuffer() },
        {
          convertImage: mammoth.images.imgElement(async (image) => {
            const alt = (image as { altText?: string }).altText ?? "";
            const b64 = await image.readAsBase64String();
            const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
            const i = images.push({ blob: new Blob([bytes], { type: image.contentType }), alt }) - 1;
            return { src: `ctximg:${i}`, alt };
          }),
        },
      );
      const started = await begin(file.name);
      if (started.error || !started.id) throw new Error(started.error ?? "Inlezen kon niet worden gestart.");
      let html = converted.value;
      let skipped = 0;
      for (const [i, img] of images.entries()) {
        setStatus(`Afbeelding ${i + 1} van ${images.length} versturen…`);
        let src = "";
        if (img.blob.size <= MAX_IMAGE) {
          const ifd = new FormData();
          ifd.append("image", img.blob, `afbeelding-${i + 1}`);
          ifd.append("alt", img.alt);
          const r = await addImage(started.id, ifd);
          if (r.src) src = r.src;
        }
        if (!src) skipped++;
        html = html.replaceAll(`src="ctximg:${i}"`, src ? `src="${src}"` : `src=""`);
      }
      setStatus("Tekst verwerken…");
      const ffd = new FormData();
      ffd.append("html", html);
      ffd.append("approvedAt", String(fd.get("approvedAt") ?? ""));
      ffd.append("sharepointUrl", String(fd.get("sharepointUrl") ?? ""));
      ffd.append("skippedImages", String(skipped));
      const done = await finish(started.id, ffd);
      if (done && "error" in done && done.error) throw new Error(done.error);
      setStatus(skipped ? `Klaar; ${skipped} afbeelding(en) konden niet worden overgenomen (te groot of onbekend formaat).` : "Klaar.");
    } catch (err) {
      // redirect() na succes gooit een speciale fout die Next.js zelf afhandelt
      if (err && typeof err === "object" && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw err;
      setError(err instanceof Error ? err.message : "Inlezen mislukt.");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-[1fr_12rem_1fr_auto] md:items-end">
      {error && (
        <div role="alert" className="rounded-md border border-brand-red/30 bg-red-50 px-3 py-2 text-sm text-brand-red-dark md:col-span-4">
          {error}
        </div>
      )}
      <Field label="Word-bestand (.docx)">
        <input
          name="file"
          type="file"
          required
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="block text-sm"
        />
      </Field>
      <Field label="Al vastgesteld op" hint="Leeg = concept">
        <input name="approvedAt" type="date" max={maxDate} className="input" />
      </Field>
      <Field label="Link naar SharePoint (optioneel)">
        <input name="sharepointUrl" type="url" pattern="https://.*" maxLength={2000} className="input" placeholder="https://…sharepoint.com/…" />
      </Field>
      <button type="submit" className="btn" disabled={busy}>
        {busy ? "Bezig…" : "Inlezen"}
      </button>
      {status && (
        <p role="status" className="text-sm text-neutral-600 md:col-span-4">
          {status}
        </p>
      )}
    </form>
  );
}
