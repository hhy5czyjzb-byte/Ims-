import type { EmissionFactor } from "@prisma/client";
import { Field } from "@/components/ui";
import { toDateInput } from "@/lib/format";

const g = (v: unknown) => (v === null || v === undefined ? "" : String(Math.round(Number(v) * 1000 * 1000) / 1000).replace(".", ","));

/** Invoer van een emissiefactor in gram CO2 per eenheid (WTT, TTW, WTW, biogeen). */
export function FactorFields({ f, unit, defaultDate }: { f?: EmissionFactor; unit: string; defaultDate?: Date }) {
  return (
    <>
      <Field label="Geldig vanaf">
        <input name="validFrom" type="date" required defaultValue={toDateInput(f?.validFrom ?? defaultDate)} className="input" />
      </Field>
      <Field label={`WTT (g/${unit})`}>
        <input name="wttG" inputMode="decimal" defaultValue={g(f?.wtt)} className="input" />
      </Field>
      <Field label={`TTW (g/${unit})`}>
        <input name="ttwG" inputMode="decimal" defaultValue={g(f?.ttw)} className="input" />
      </Field>
      <Field label={`WTW (g/${unit})`} hint="Leeg = WTT + TTW">
        <input name="wtwG" inputMode="decimal" defaultValue={g(f?.factor)} className="input" />
      </Field>
      <Field label={`Biogeen (g/${unit})`}>
        <input name="biogenicG" inputMode="decimal" defaultValue={g(f?.biogenic)} className="input" />
      </Field>
      <Field label="Bron" className="md:col-span-2">
        <input name="source" required maxLength={300} defaultValue={f?.source ?? "CO2emissiefactoren.nl"} className="input" />
      </Field>
    </>
  );
}
