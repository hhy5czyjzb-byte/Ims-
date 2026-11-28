import type { ContextFactor } from "@prisma/client";
import type { ActionResult } from "@/lib/action-result";
import { Field, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { CONTEXT_FACTOR_KIND_LABEL, options } from "@/lib/labels";

export function ContextFactorForm({
  factor,
  formAction,
  submitLabel,
  reset,
}: {
  factor?: ContextFactor;
  formAction: (fd: FormData) => Promise<ActionResult>;
  submitLabel: string;
  reset?: boolean;
}) {
  return (
    <Form action={formAction} resetOnSuccess={reset} className="grid gap-3 md:grid-cols-4">
      <Field label="Naam" className="md:col-span-2" hint={factor ? "Bij een nieuwe naam gaan de koppelingen in de registers mee" : undefined}>
        <input name="name" required maxLength={200} defaultValue={factor?.name} className="input" />
      </Field>
      <Field label="Extern / intern">
        <Select name="kind" options={options(CONTEXT_FACTOR_KIND_LABEL)} defaultValue={factor?.kind ?? "EXTERNAL"} />
      </Field>
      <Field label="Paragraaf in de analyse">
        <input name="sectionNumber" maxLength={20} defaultValue={factor?.sectionNumber ?? ""} className="input" placeholder="Bijv. 3.1" />
      </Field>
      <Field label="Belang">
        <input name="importance" maxLength={100} defaultValue={factor?.importance ?? ""} className="input" placeholder="Hoog, Toenemend, …" />
      </Field>
      <Field label="Karakter">
        <input name="character" maxLength={100} defaultValue={factor?.character ?? ""} className="input" placeholder="Risico, Kans, Risico én kans, …" />
      </Field>
      <Field label="Volgorde">
        <input name="sortOrder" type="number" min={0} defaultValue={factor?.sortOrder ?? 0} className="input" />
      </Field>
      {factor && (
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={factor.active} /> Actief
        </label>
      )}
      <Field label="Wat we ermee willen" className="md:col-span-4">
        <textarea name="ambition" rows={2} maxLength={2000} defaultValue={factor?.ambition ?? ""} className="input" />
      </Field>
      <div className="md:col-span-4">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </Form>
  );
}
