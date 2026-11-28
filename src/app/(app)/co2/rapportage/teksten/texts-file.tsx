"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importReportTexts } from "../actions";

/** Tekstenbestand downloaden of inlezen (bijv. van de lokale versie naar de online versie). */
export function TextsFile() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const onFile = (file?: File) => {
    if (!file) return;
    setMsg(null);
    start(async () => {
      const res = await importReportTexts(await file.text());
      if (res?.error) setMsg({ ok: false, text: res.error });
      else {
        setMsg({ ok: true, text: "Teksten ingelezen. Controleer ze hieronder en in het jaarverslag." });
        router.refresh();
      }
    });
  };
  return (
    <section className="card mb-6 print:hidden">
      <h2 className="mb-1">Tekstenbestand</h2>
      <p className="mb-3 text-sm text-neutral-600">
        Download de teksten als bestand (kopie, of om over te zetten naar een andere omgeving) of lees een tekstenbestand in. Onderdelen die in het bestand zijn
        ingevuld vervangen de huidige tekst; lege onderdelen in het bestand laten de huidige tekst staan.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <a href="/co2/rapportage/teksten/bestand" className="btn-secondary">
          Teksten downloaden
        </a>
        <label className="btn-secondary cursor-pointer">
          {pending ? "Bezig met inlezen…" : "Tekstenbestand inlezen"}
          <input
            type="file"
            accept=".json,application/json"
            className="sr-only"
            disabled={pending}
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}
    </section>
  );
}
