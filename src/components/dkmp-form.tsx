import type { DataQualityItem } from "@prisma/client";
import type { ActionResult } from "@/lib/action-result";
import { Field, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { toDateInput } from "@/lib/format";

/** Regel in het datakwaliteitsmanagementplan (DKMP). */
export function DkmpForm({
  item,
  formAction,
  carriers,
  sections,
  submitLabel,
}: {
  item?: DataQualityItem;
  formAction: (fd: FormData) => Promise<ActionResult>;
  carriers: { value: string; label: string }[];
  sections: string[];
  submitLabel: string;
}) {
  const v = (k: keyof DataQualityItem) => (item?.[k] as string | null) ?? "";
  return (
    <Form action={formAction} resetOnSuccess={!item} className="grid gap-3 md:grid-cols-4">
      <Field label="Groep (emissiestroom)">
        <input name="section" required list="dkmp-sections" defaultValue={v("section")} className="input" placeholder="bijv. Aardgasverbruik" />
        <datalist id="dkmp-sections">
          {sections.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </Field>
      <Field label="Emissiestroom / aansluiting">
        <input name="stream" required defaultValue={v("stream")} className="input" placeholder="bijv. Den Sliem 74" />
      </Field>
      <Field label="Eenheid">
        <input name="unit" defaultValue={v("unit")} className="input" />
      </Field>
      <Field label="Energiedrager (koppeling)">
        <Select name="carrierId" options={carriers} defaultValue={item?.carrierId} placeholder="—" />
      </Field>
      <Field label="Bron (systeem / leverancier)" className="md:col-span-2">
        <input name="source" defaultValue={v("source")} className="input" />
      </Field>
      <Field label="Brondata van">
        <input name="dataOwner" defaultValue={v("dataOwner")} className="input" />
      </Field>
      <Field label="Uitvoerder">
        <input name="executor" defaultValue={v("executor")} className="input" />
      </Field>
      <Field label="Datum / periode uitvraag">
        <input name="requestPeriod" defaultValue={v("requestPeriod")} className="input" placeholder="bijv. Februari" />
      </Field>
      <Field label="Datum / periode analyse">
        <input name="analysisPeriod" defaultValue={v("analysisPeriod")} className="input" placeholder="bijv. Maart/april" />
      </Field>
      <Field label="Kwaliteit data (1–5)">
        <input name="qualityScore" type="number" min={1} max={5} defaultValue={item?.qualityScore ?? ""} className="input" />
      </Field>
      <Field label="Laatst gecontroleerd">
        <input name="lastCheckedAt" type="date" defaultValue={toDateInput(item?.lastCheckedAt)} className="input" />
      </Field>
      <Field label="Afwijking + oplossing" className="md:col-span-4">
        <textarea name="deviation" rows={2} defaultValue={v("deviation")} className="input" />
      </Field>
      <Field label="Onzekerheden en impact" className="md:col-span-2">
        <textarea name="uncertainty" rows={3} defaultValue={v("uncertainty")} className="input" />
      </Field>
      <Field label="Verbeterplan datakwaliteit" className="md:col-span-2">
        <textarea name="improvement" rows={3} defaultValue={v("improvement")} className="input" />
      </Field>
      <div className="md:col-span-4">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </Form>
  );
}
