"use client";

import { useState } from "react";
import { aspectScore, determineSignificance } from "@/lib/aspects";

type Defaults = {
  frequency: number | null;
  severity: number | null;
  extent: number | null;
  score: number | null;
  legalApplies: boolean;
  stakeholderConcern: boolean;
  significanceManual: boolean;
  significant: boolean;
  significanceReason: string | null;
};

const SCALE: Record<"frequency" | "severity" | "extent", string[]> = {
  frequency: ["", "1 · zelden (< 1× per jaar)", "2 · enkele keren per jaar", "3 · maandelijks", "4 · wekelijks", "5 · dagelijks / continu"],
  severity: ["", "1 · verwaarloosbaar", "2 · gering", "3 · merkbaar", "4 · ernstig", "5 · zeer ernstig / onomkeerbaar"],
  extent: ["", "1 · op de werkplek", "2 · op het terrein", "3 · directe omgeving", "4 · regionaal", "5 · groot gebied / globaal"],
};
const LABEL = { frequency: "Frequentie / kans (F)", severity: "Ernst (E)", extent: "Omvang (O)" } as const;

/** Scoring en significantie met live voorbeeld. Gekoppelde wettelijke eisen tellen bij het opslaan ook mee als bindende verplichting. */
export function AspectScoringFields({ defaults, threshold }: { defaults?: Partial<Defaults>; threshold: number }) {
  const [v, setV] = useState({
    frequency: defaults?.frequency ?? null,
    severity: defaults?.severity ?? null,
    extent: defaults?.extent ?? null,
  });
  const fe = aspectScore(v.frequency, v.severity, v.extent);
  const [ownScore, setOwnScore] = useState<string>(fe === null && defaults?.score != null ? String(defaults.score) : "");
  const [legal, setLegal] = useState(defaults?.legalApplies ?? false);
  const [stake, setStake] = useState(defaults?.stakeholderConcern ?? false);
  const [manual, setManual] = useState(defaults?.significanceManual ?? false);
  const [manualSig, setManualSig] = useState<"ja" | "nee">(defaults?.significant ? "ja" : "nee");
  const [reason, setReason] = useState(defaults?.significanceReason ?? "");

  const score = fe ?? (ownScore.trim() !== "" && Number.isInteger(Number(ownScore)) ? Number(ownScore) : null);
  const result = determineSignificance({
    score,
    threshold,
    legalApplies: legal,
    stakeholderConcern: stake,
    manual: manual ? { significant: manualSig === "ja", reason: reason || null } : null,
  });

  return (
    <div className="rounded-md border border-neutral-200 p-3 md:col-span-4" role="group" aria-label="Scoring en significantie">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">Scoring en significantie</span>
        <span className="flex items-center gap-2 text-sm">
          <span className="text-neutral-500">Score {score ?? "—"}</span>
          <span className={`badge font-semibold ${result.significant ? "bg-brand-red text-white" : "bg-neutral-100 text-neutral-700"}`}>
            {result.significant ? "Significant" : "Niet significant"}
          </span>
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {(["frequency", "severity", "extent"] as const).map((k) => (
          <label key={k} className="block">
            <span className="mb-1 block text-xs text-neutral-600">{LABEL[k]}</span>
            <select
              name={k}
              value={v[k] ?? ""}
              onChange={(e) => setV((s) => ({ ...s, [k]: e.target.value ? Number(e.target.value) : null }))}
              className="input"
            >
              {SCALE[k].map((label, i) => (
                <option key={i} value={i === 0 ? "" : i}>
                  {i === 0 ? "—" : label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-600">Of: score uit eigen methode</span>
          <input
            name="ownScore"
            type="number"
            min={0}
            value={fe === null ? ownScore : ""}
            disabled={fe !== null}
            onChange={(e) => setOwnScore(e.target.value)}
            className="input disabled:bg-neutral-100"
            placeholder={fe !== null ? "F × E × O wordt gebruikt" : ""}
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="legalApplies" checked={legal} onChange={(e) => setLegal(e.target.checked)} /> Bindende verplichting van toepassing
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="stakeholderConcern" checked={stake} onChange={(e) => setStake(e.target.checked)} /> Zorgen bij belanghebbenden (bijv.
          klachten)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="significanceManual" checked={manual} onChange={(e) => setManual(e.target.checked)} /> Significantie handmatig bepalen
        </label>
      </div>
      {manual && (
        <div className="mt-3 grid gap-2 md:grid-cols-[10rem_1fr]">
          <select
            name="manualSignificant"
            value={manualSig}
            onChange={(e) => setManualSig(e.target.value as "ja" | "nee")}
            className="input"
            aria-label="Handmatig: significant"
          >
            <option value="ja">Significant</option>
            <option value="nee">Niet significant</option>
          </select>
          <input
            name="significanceReason"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="input"
            placeholder="Toelichting (verplicht)"
            aria-label="Toelichting handmatige bepaling"
          />
        </div>
      )}
      <p className="mt-2 text-xs text-neutral-500">
        {result.reasons.length ? result.reasons.join(" · ") : "Geen criterium voor significantie van toepassing."} Score = F × E × O (1–125); significant vanaf{" "}
        {threshold}. Gekoppelde wettelijke eisen tellen bij het opslaan ook als bindende verplichting.
      </p>
    </div>
  );
}
