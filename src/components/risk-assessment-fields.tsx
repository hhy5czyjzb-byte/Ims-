"use client";

import { useState } from "react";
import type { RiskType } from "@prisma/client";
import { IMPACT_LABEL, LIKELIHOOD_LABEL, RISK_LEVEL_LABEL, RISK_SCALE, riskColor, riskLevel, riskTextColor } from "@/lib/risk";

type Values = { type: RiskType; likelihoodBefore: number | null; impactBefore: number | null; likelihoodAfter: number | null; impactAfter: number | null };

/** Type + beoordeling vóór en na maatregelen, met live score en kleur. */
export function RiskAssessmentFields({ defaults }: { defaults?: Partial<Values> }) {
  const [type, setType] = useState<RiskType>(defaults?.type ?? "RISK");
  return (
    <>
      <fieldset className="md:col-span-4">
        <legend className="label">Soort</legend>
        <div className="flex gap-4 text-sm">
          {(["RISK", "OPPORTUNITY"] as const).map((t) => (
            <label key={t} className="flex items-center gap-1.5">
              <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} />
              {t === "RISK" ? "Risico (bedreiging)" : "Kans"}
            </label>
          ))}
        </div>
      </fieldset>
      <ScorePicker
        className="md:col-span-2"
        title="Beoordeling vóór maatregelen (bruto)"
        type={type}
        names={["likelihoodBefore", "impactBefore"]}
        defaults={[defaults?.likelihoodBefore ?? null, defaults?.impactBefore ?? null]}
        required
      />
      <ScorePicker
        className="md:col-span-2"
        title="Beoordeling na maatregelen (rest)"
        type={type}
        names={["likelihoodAfter", "impactAfter"]}
        defaults={[defaults?.likelihoodAfter ?? null, defaults?.impactAfter ?? null]}
        hint="Laat leeg zolang de maatregelen nog niet beoordeeld zijn."
      />
    </>
  );
}

function ScorePicker({
  title,
  type,
  names,
  defaults,
  required,
  hint,
  className,
}: {
  title: string;
  type: RiskType;
  names: [string, string];
  defaults: [number | null, number | null];
  required?: boolean;
  hint?: string;
  className?: string;
}) {
  const [l, setL] = useState<number | null>(defaults[0]);
  const [i, setI] = useState<number | null>(defaults[1]);
  const score = l && i ? l * i : null;
  return (
    <div className={`rounded-md border border-neutral-200 p-3 ${className ?? ""}`} role="group" aria-label={title}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-neutral-700">{title}</span>
        {score ? (
          <span className="badge font-semibold" style={{ backgroundColor: riskColor(score, type), color: riskTextColor(score, type) }}>
            {score} · {RISK_LEVEL_LABEL[riskLevel(score)]}
          </span>
        ) : (
          <span className="text-xs text-neutral-400">nog geen score</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-600">Kans</span>
          <select name={names[0]} required={required} value={l ?? ""} onChange={(e) => setL(e.target.value ? Number(e.target.value) : null)} className="input">
            <option value="">—</option>
            {RISK_SCALE.map((v) => (
              <option key={v} value={v}>
                {v} · {LIKELIHOOD_LABEL[v]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-600">Effect</span>
          <select name={names[1]} required={required} value={i ?? ""} onChange={(e) => setI(e.target.value ? Number(e.target.value) : null)} className="input">
            <option value="">—</option>
            {RISK_SCALE.map((v) => (
              <option key={v} value={v}>
                {v} · {IMPACT_LABEL[type][v]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}
