"use client";

import { useState } from "react";
import {
  ASPECT_RISK_LEVEL_APPROACH,
  ASPECT_RISK_LEVEL_CLASS,
  ASPECT_RISK_LEVEL_LABEL,
  aspectRisk,
  aspectRiskLevel,
  EFFECT_SCALE,
  EXPOSURE_SCALE,
  determineAspectSignificance,
  describeSignificanceRule,
  PRIORITY_SIGNAL_LABEL,
  PROBABILITY_SCALE,
  prioritySignal,
  type SignificanceRule,
} from "@/lib/aspects";

type Prio = "HIGH" | "MEDIUM" | "LOW" | "";
export type AssessmentDefaults = {
  effectScore: number | null;
  exposure: number | null;
  probability: number | null;
  opportunity: boolean;
  priority: Prio;
  priorityRationale: string | null;
};

const fmt = (n: number) => n.toLocaleString("nl-NL", { maximumFractionDigits: 2 });

function ScaleSelect({
  name,
  label,
  scale,
  value,
  onChange,
}: {
  name: string;
  label: string;
  scale: [number, string][];
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  // Afwijkende waarde uit een import blijft kiesbaar.
  const opts = value !== null && !scale.some(([v]) => v === value) ? [...scale, [value, "Afwijkende waarde"] as [number, string]] : scale;
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-neutral-600">{label}</span>
      <select name={name} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} className="input">
        <option value="">—</option>
        {opts.map(([v, text]) => (
          <option key={v} value={v}>
            {fmt(v)} · {text}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Beoordeling volgens het MAR: E × B × W (Fine & Kinney) met live risiconiveau, prio en signaal. */
export function AspectAssessmentFields({
  defaults,
  rule,
  legalApplies,
  complaints,
}: {
  defaults?: AssessmentDefaults;
  rule: SignificanceRule;
  legalApplies: boolean;
  complaints: boolean;
}) {
  const [e, setE] = useState<number | null>(defaults?.effectScore ?? null);
  const [b, setB] = useState<number | null>(defaults?.exposure ?? null);
  const [w, setW] = useState<number | null>(defaults?.probability ?? null);
  const [opportunity, setOpportunity] = useState(defaults?.opportunity ?? false);
  const [priority, setPriority] = useState<Prio>(defaults?.priority ?? "");
  const risk = aspectRisk(e, b, w);
  const level = aspectRiskLevel(risk);
  const signal = prioritySignal({ priority: priority || null, risk, opportunity });
  const sig = determineAspectSignificance({ priority: priority || null, effectScore: e, exposure: b, probability: w, legalApplies, complaints }, rule);

  return (
    <div className="rounded-md border border-neutral-200 p-3 md:col-span-4" role="group" aria-label="Beoordeling">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">Beoordeling (effect × voorkomen × waarschijnlijkheid)</span>
        <span className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-neutral-500">Risico {risk === null ? "—" : fmt(risk)}</span>
          {level && <span className={`badge font-semibold ${ASPECT_RISK_LEVEL_CLASS[level]}`}>{ASPECT_RISK_LEVEL_LABEL[level]}</span>}
          <span
            title={sig.reasons.join(" · ")}
            className={`badge font-semibold ${sig.significant ? "bg-brand-red text-white" : "bg-neutral-100 text-neutral-700"}`}
          >
            {sig.significant ? "Significant" : priority ? "Niet significant" : "Nog geen prio"}
          </span>
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <ScaleSelect name="effectScore" label="Effect (E)" scale={EFFECT_SCALE} value={e} onChange={setE} />
        <ScaleSelect name="exposure" label="Voorkomen (B)" scale={EXPOSURE_SCALE} value={b} onChange={setB} />
        <ScaleSelect name="probability" label="Waarschijnlijkheid (W)" scale={PROBABILITY_SCALE} value={w} onChange={setW} />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[12rem_12rem_1fr]">
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-600">Kans of bedreiging</span>
          <select
            name="opportunity"
            value={opportunity ? "kans" : "bedreiging"}
            onChange={(ev) => setOpportunity(ev.target.value === "kans")}
            className="input"
          >
            <option value="bedreiging">Bedreiging</option>
            <option value="kans">Kans</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-600">Prio (eigen weging)</span>
          <select name="priority" value={priority} onChange={(ev) => setPriority(ev.target.value as Prio)} className="input">
            <option value="">— Nog geen prio —</option>
            <option value="HIGH">H · hoog</option>
            <option value="MEDIUM">M · middel</option>
            <option value="LOW">L · laag</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-600">
            Onderbouwing prio {signal && <span className="font-semibold text-amber-700">— {PRIORITY_SIGNAL_LABEL[signal].toLowerCase()}</span>}
          </span>
          <input
            name="priorityRationale"
            maxLength={5000}
            defaultValue={defaults?.priorityRationale ?? ""}
            className="input"
            placeholder={signal ? "Waarom wijkt de prio af van het risiconiveau?" : ""}
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        {level ? `${ASPECT_RISK_LEVEL_LABEL[level]}: ${ASPECT_RISK_LEVEL_APPROACH[level]} ` : ""}Niveaus: ≤ 20 laag, 21–70 middel, 71–200 hoog, &gt; 200 zeer
        hoog. De prio weegt ook levenscyclus, wetgeving en stakeholders mee. Significant bij {describeSignificanceRule(rule)}.
        {opportunity && " Bij kansen wordt de prio niet met het risiconiveau vergeleken."}
      </p>
    </div>
  );
}
