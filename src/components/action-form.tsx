import type { Action, NormRequirement } from "@prisma/client";
import type { ActionResult } from "@/lib/action-result";
import { Field, Select } from "@/components/ui";
import { CheckboxPicker } from "@/components/checkbox-picker";
import { SubmitButton } from "@/components/submit-button";
import { ACTION_KIND_LABEL, ACTION_PRIORITY_LABEL, ACTION_SOURCE_LABEL, ACTION_STATUS_LABEL, options } from "@/lib/labels";
import { toDateInput } from "@/lib/format";
import { Form } from "@/components/form";

type Opt = { value: string; label: string };

export function ActionForm({
  action,
  formAction,
  lookups,
  requirementGroups,
  submitLabel,
}: {
  action?: Action & { requirements: Pick<NormRequirement, "id">[] };
  formAction: (formData: FormData) => Promise<ActionResult>;
  lookups: { users: Opt[]; disciplines: Opt[]; locations: Opt[] };
  requirementGroups: { norm: string; options: Opt[] }[];
  submitLabel: string;
}) {
  return (
    <Form action={formAction} className="grid gap-4 md:grid-cols-4">
      <Field label="Titel" className="md:col-span-4">
        <input name="title" required maxLength={300} defaultValue={action?.title} className="input" />
      </Field>
      <Field label="Omschrijving" className="md:col-span-4">
        <textarea name="description" rows={3} defaultValue={action?.description ?? ""} className="input" />
      </Field>
      <Field label="Eigenaar (gebruiker)">
        <Select name="ownerId" options={lookups.users} defaultValue={action?.ownerId} placeholder="— Kies —" />
      </Field>
      <Field label="Of eigenaar (naam / functie)">
        <input name="ownerText" maxLength={200} defaultValue={action?.ownerText ?? ""} className="input" placeholder="Bijv. Manager Beton" />
      </Field>
      <Field label="Soort">
        <Select name="kind" options={options(ACTION_KIND_LABEL)} defaultValue={action?.kind ?? "TASK"} />
      </Field>
      <Field label="Deadline">
        <input name="deadline" type="date" defaultValue={toDateInput(action?.deadline)} className="input" />
      </Field>
      <Field
        label="Oorzaak (root cause)"
        className="md:col-span-4"
        hint="Verplicht bij een corrigerende maatregel: welke oorzaak neemt deze maatregel weg? Bij een correctie, taak of verbetering niet nodig."
      >
        <textarea name="rootCause" rows={2} defaultValue={action?.rootCause ?? ""} className="input" />
      </Field>
      <Field label="Prioriteit">
        <Select name="priority" options={options(ACTION_PRIORITY_LABEL)} defaultValue={action?.priority ?? "MEDIUM"} />
      </Field>
      <Field label="Bron">
        <Select name="source" options={options(ACTION_SOURCE_LABEL)} defaultValue={action?.source ?? "MANUAL"} />
      </Field>
      <Field label="Discipline">
        <Select name="disciplineId" options={lookups.disciplines} defaultValue={action?.disciplineId} placeholder="Bedrijfsbreed" />
      </Field>
      <Field label="Locatie">
        <Select name="locationId" options={lookups.locations} defaultValue={action?.locationId} placeholder="Alle locaties" />
      </Field>
      {action && (
        <>
          <Field label="Status">
            <Select name="status" options={options(ACTION_STATUS_LABEL)} defaultValue={action.status} />
          </Field>
          <Field label="Resultaat / evaluatie" className="md:col-span-4">
            <textarea name="result" rows={3} defaultValue={action.result ?? ""} className="input" />
          </Field>
          <Field label="Effectiviteit gecontroleerd op">
            <input name="verifiedAt" type="date" defaultValue={toDateInput(action.verifiedAt)} className="input" />
          </Field>
          <Field label="Uitkomst controle effectiviteit" className="md:col-span-3">
            <input
              name="verificationNote"
              maxLength={2000}
              defaultValue={action.verificationNote ?? ""}
              className="input"
              placeholder="Heeft de maatregel gewerkt?"
            />
          </Field>
        </>
      )}
      <Field label="Gekoppelde normeisen (optioneel)" className="md:col-span-4" group>
        <CheckboxPicker
          name="requirementIds"
          groups={requirementGroups.map((g) => ({ label: g.norm, options: g.options }))}
          selected={action?.requirements.map((r) => r.id) ?? []}
          height="12rem"
        />
      </Field>
      <div className="md:col-span-4">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </Form>
  );
}
