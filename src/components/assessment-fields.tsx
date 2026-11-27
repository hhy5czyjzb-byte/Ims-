"use client";

import { useMemo, useState } from "react";
import type { ComplianceStatus } from "@prisma/client";
import { COMPLIANCE_STATUS_LABEL } from "@/lib/labels";
import { addMonths } from "@/lib/compliance";

type Opt = { value: string; label: string };
const CHOICES: ComplianceStatus[] = ["COMPLIANT", "PARTIAL", "NON_COMPLIANT", "NOT_APPLICABLE"];

/**
 * Velden van een toetsing. Bij 'voldoet niet' of 'deels' verschijnen de velden voor een actie
 * (bij 'voldoet niet' verplicht, tenzij er al een open actie is). De volgende toetsdatum wordt voorgesteld.
 */
export function AssessmentFields({
  title,
  intervalMonths,
  defaultOwnerId,
  users,
  openActions,
  canCreateActions,
}: {
  title: string;
  intervalMonths: number;
  defaultOwnerId: string | null;
  users: Opt[];
  openActions: number;
  canCreateActions: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [status, setStatus] = useState<ComplianceStatus | "">("");
  const suggestedNext = useMemo(() => {
    const d = new Date(`${date}T00:00:00Z`);
    return isNaN(d.getTime()) || status === "NOT_APPLICABLE" ? "" : addMonths(d, intervalMonths).toISOString().slice(0, 10);
  }, [date, status, intervalMonths]);
  const showAction = canCreateActions && (status === "NON_COMPLIANT" || status === "PARTIAL");
  const actionRequired = status === "NON_COMPLIANT" && openActions === 0;

  return (
    <>
      <label className="block">
        <span className="label">Datum toetsing</span>
        <input name="date" type="date" required max={today} value={date} onChange={(e) => setDate(e.target.value)} className="input" />
      </label>
      <fieldset className="md:col-span-3">
        <legend className="label">Uitkomst</legend>
        <div className="flex flex-wrap gap-2">
          {CHOICES.map((c) => (
            <label
              key={c}
              className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-2 text-sm ${status === c ? "border-brand-red bg-red-50 font-medium" : "border-neutral-300 bg-white"}`}
            >
              <input type="radio" name="status" value={c} required checked={status === c} onChange={() => setStatus(c)} />
              {COMPLIANCE_STATUS_LABEL[c]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block md:col-span-3">
        <span className="label">Toelichting / bewijs</span>
        <textarea name="explanation" rows={2} className="input" placeholder="Waarop is het oordeel gebaseerd? (meting, vergunning, rapport, waarneming)" />
      </label>
      <label className="block">
        <span className="label">Volgende toetsing</span>
        <input name="nextReviewDate" type="date" key={suggestedNext} defaultValue={suggestedNext} className="input" />
        <span className="mt-1 block text-xs text-neutral-500">Voorstel: over {intervalMonths} maanden</span>
      </label>
      {showAction && (
        <div className="rounded-md border border-brand-red/30 bg-red-50/50 p-3 md:col-span-4">
          <div className="mb-2 text-sm font-medium">
            {actionRequired ? "Actie (verplicht bij 'voldoet niet')" : openActions ? `Extra actie (er lopen al ${openActions} actie(s))` : "Actie (optioneel)"}
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr_14rem_10rem]">
            <input
              name="actionTitle"
              required={actionRequired}
              defaultValue={actionRequired ? `Voldoen aan: ${title}`.slice(0, 300) : ""}
              className="input"
              placeholder="Wat moet er gebeuren?"
              aria-label="Actie"
            />
            <select name="actionOwnerId" defaultValue={defaultOwnerId ?? ""} className="input" aria-label="Eigenaar actie">
              <option value="">— Eigenaar —</option>
              {users.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
            <input name="actionDeadline" type="date" className="input" aria-label="Deadline actie" />
          </div>
        </div>
      )}
    </>
  );
}
