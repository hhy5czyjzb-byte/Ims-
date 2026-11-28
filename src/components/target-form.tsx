import type { ReductionTarget } from "@prisma/client";
import type { ActionResult } from "@/lib/action-result";
import { Field, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";

type Opt = { value: string; label: string };

export function TargetForm({
  target,
  formAction,
  disciplines,
  submitLabel,
}: {
  target?: ReductionTarget;
  formAction: (formData: FormData) => Promise<ActionResult>;
  disciplines: Opt[];
  submitLabel: string;
}) {
  const y = new Date().getUTCFullYear();
  return (
    <Form action={formAction} className="grid gap-3 md:grid-cols-4">
      <Field label="Titel" className="md:col-span-4">
        <input
          name="title"
          required
          maxLength={300}
          defaultValue={target?.title}
          className="input"
          placeholder="bijv. Scope 1 en 2: −25 % in 2030 t.o.v. 2024"
        />
      </Field>
      <Field label="Scope">
        <Select
          name="scope"
          options={[
            { value: "1", label: "Scope 1" },
            { value: "2", label: "Scope 2" },
            { value: "3", label: "Zakelijk reizen" },
          ]}
          defaultValue={target?.scope ? String(target.scope) : ""}
          placeholder="Totaal (alle scopes)"
        />
      </Field>
      <Field label="Basisjaar">
        <input name="baseYear" type="number" required min={2000} max={2100} defaultValue={target?.baseYear ?? y - 1} className="input" />
      </Field>
      <Field label="Doeljaar">
        <input name="targetYear" type="number" required min={2000} max={2100} defaultValue={target?.targetYear ?? y + 4} className="input" />
      </Field>
      <Field label="Reductie (%)">
        <input
          name="reductionPct"
          required
          inputMode="decimal"
          defaultValue={target ? String(Number(target.reductionPct)).replace(".", ",") : ""}
          className="input"
          placeholder="bijv. 25"
        />
      </Field>
      <Field label="Discipline">
        <Select name="disciplineId" options={disciplines} defaultValue={target?.disciplineId} placeholder="Bedrijfsbreed" />
      </Field>
      <Field label="Uitstoot basisjaar (kg, optioneel)" hint="Leeg = berekend uit het vastgelegde verbruik" className="md:col-span-2">
        <input
          name="baselineKg"
          inputMode="decimal"
          defaultValue={target?.baselineKg ? String(Number(target.baselineKg)).replace(".", ",") : ""}
          className="input"
        />
      </Field>
      {target && (
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={target.active} /> Actief
        </label>
      )}
      <Field label="Toelichting" className="md:col-span-4">
        <textarea name="description" rows={2} defaultValue={target?.description ?? ""} className="input" />
      </Field>
      <div className="md:col-span-4">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </Form>
  );
}
