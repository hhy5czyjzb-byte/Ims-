"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { importReview, uploadReviewImage } from "@/app/(app)/directiebeoordeling/actions";
import { applyMediaIds, deckMedia, parseDeck } from "@/lib/review-pptx-import";
import { shrink } from "@/components/review/image-shrink";

export function ReviewImportForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear() - 1));
  const [file, setFile] = useState<File | null>(null);

  async function onFile(f: File | null) {
    setFile(f);
    setError(null);
    if (!f) return;
    const m = f.name.match(/(20\d\d)/);
    if (m) setYear(m[1]);
    if (!title) setTitle(f.name.replace(/\.pptx$/i, "").replace(/[_-]+/g, " "));
  }

  async function run() {
    if (!file) return setError("Kies eerst een PowerPoint-bestand (.pptx).");
    setBusy(true);
    setError(null);
    try {
      setStatus("PowerPoint lezen…");
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(file);
      const files: Record<string, string> = {};
      for (const [path, entry] of Object.entries(zip.files)) if (!entry.dir && /\.(xml|rels)$/.test(path)) files[path] = await entry.async("string");
      const deck = parseDeck(files);
      if (!deck.slides.length) throw new Error("Geen dia's gevonden in dit bestand.");
      const media = deckMedia(deck);
      const ids: Record<string, string> = {};
      for (const [i, m] of media.entries()) {
        setStatus(`Afbeeldingen opslaan… ${i + 1} van ${media.length}`);
        const entry = zip.file(m.path);
        if (!entry) continue;
        const raw = await entry.async("blob");
        const { file: img, width, height } = await shrink(raw, m.role, m.path);
        if (img.size > 4 * 1024 * 1024) continue;
        const fd = new FormData();
        fd.set("image", new File([img], m.path.split("/").pop() ?? "afbeelding", { type: img.type || "image/png" }));
        fd.set("role", m.role);
        fd.set("name", m.path.split("/").pop() ?? "");
        fd.set("width", String(width));
        fd.set("height", String(height));
        const res = await uploadReviewImage(fd);
        if (res.id) ids[m.path] = res.id;
      }
      setStatus("Dia's opslaan…");
      const slides = applyMediaIds(deck, ids);
      const res = await importReview({
        title: title.trim() || (deck.slides[0]?.title ?? "Managementreview"),
        year: Number(year),
        footerText: deck.footer,
        logoImageId: deck.logo ? (ids[deck.logo] ?? null) : null,
        stripImageId: deck.strip ? (ids[deck.strip] ?? null) : null,
        slides,
      });
      if (res.error || !res.id) throw new Error(res.error ?? "Opslaan mislukt.");
      setStatus(`Klaar: ${slides.length - (res.skipped ?? 0)} dia's ingelezen.`);
      router.push(`/directiebeoordeling/${res.id}`);
    } catch (e) {
      setError((e as Error).message || "Inlezen mislukt.");
      setStatus(null);
      setBusy(false);
    }
  }

  return (
    <div className="card max-w-2xl space-y-4">
      {error && <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <label className="block">
        <span className="label">PowerPoint-bestand (.pptx)</span>
        <input
          type="file"
          accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          className="input"
          disabled={busy}
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
        <span className="mt-1 block text-xs text-neutral-500">
          Het bestand wordt in je browser gelezen; alleen de teksten en (verkleinde) afbeeldingen gaan naar de app.
        </span>
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block sm:col-span-2">
          <span className="label">Titel</span>
          <input className="input" value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} placeholder="Managementreview 2025" />
        </label>
        <label className="block">
          <span className="label">Beoordelingsjaar</span>
          <input className="input" type="number" min={2000} max={2100} value={year} disabled={busy} onChange={(e) => setYear(e.target.value)} />
        </label>
      </div>
      <button type="button" className="btn" disabled={busy || !file} onClick={run}>
        {busy ? "Bezig…" : "Inlezen"}
      </button>
      {status && <p className="text-sm text-neutral-600">{status}</p>}
    </div>
  );
}
