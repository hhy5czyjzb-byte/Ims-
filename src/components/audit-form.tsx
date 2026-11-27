import type { Audit, Norm } from "@prisma/client";
import type { ActionResult } from "@/lib/action-result";
import { Field, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { CheckboxPicker } from "@/components/checkbox-picker";
import { SubmitButton } from "@/components/submit-button";
import { AUDIT_STATUS_LABEL, AUDIT_TYPE_LABEL, options } from "@/lib/labels";
import { toDateInput } from "@/lib/format";

type Opt = { value: string; label: string };

export function AuditForm({
  audit,
  formAction,
  lookups,
  normOptions,
  submitLabel,
}: {
  audit?: Audit & { norms: Pick<Norm, "id">[] };
  formAction: (formData: FormData) => Promise<ActionResult>;
  lookups: { disciplines: Opt[]; locations: Opt[] };
  normOptions: Opt[];
  submitLabel: string;
}) {
  return (
    <Form action={formAction} className="grid gap-4 md:grid-cols-4">
      <Field label="Soort audit">
        <Select name="type" options={options(AUDIT_TYPE_LABEL)} defaultValue={audit?.type ?? "INTERNAL"} />
      </Field>
      <Field label="Titel" className="md:col-span-3">
        <input name="title" required maxLength={300} defaultValue={audit?.title} className="input" placeholder="Bijv. Interne audit ISO 9001 productie beton" />
      </Field>
      <Field label="Geplande datum">
        <input name="plannedDate" type="date" required defaultValue={toDateInput(audit?.plannedDate)} className="input" />
      </Field>
      <Field label="Auditor(s)">
        <input name="auditor" defaultValue={audit?.auditor ?? ""} className="input" placeholder="Naam / namen" />
      </Field>
      <Field label="Certificatie-instelling / klant" hint="Bij een externe of klantaudit">
        <input name="certificationBody" defaultValue={audit?.certificationBody ?? ""} className="input" />
      </Field>
      <Field label="Locatie">
        <Select name="locationId" options={lookups.locations} defaultValue={audit?.locationId} placeholder="Alle locaties" />
      </Field>
      <Field label="Discipline">
        <Select name="disciplineId" options={lookups.disciplines} defaultValue={audit?.disciplineId} placeholder="Bedrijfsbreed" />
      </Field>
      <Field label="Link naar auditrapport (SharePoint)" className="md:col-span-3">
        <input name="reportUrl" type="url" pattern="https://.*" defaultValue={audit?.reportUrl ?? ""} className="input" placeholder="https://…" />
      </Field>
      <Field label="Scope / onderwerpen" className="md:col-span-4">
        <textarea name="scope" rows={2} defaultValue={audit?.scope ?? ""} className="input" />
      </Field>
      <Field label="Normen" className="md:col-span-2" group>
        <CheckboxPicker name="normIds" groups={[{ label: "Normen", options: normOptions }]} selected={audit?.norms.map((n) => n.id) ?? []} height="10rem" />
      </Field>
      {audit ? (
        <div className="grid gap-4 md:col-span-2 md:grid-cols-2">
          <Field label="Status">
            <Select name="status" options={options(AUDIT_STATUS_LABEL)} defaultValue={audit.status} />
          </Field>
          <Field label="Uitgevoerd op">
            <input name="completedDate" type="date" defaultValue={toDateInput(audit.completedDate)} className="input" />
          </Field>
          <Field label="Conclusie / samenvatting" className="md:col-span-2">
            <textarea name="conclusion" rows={4} defaultValue={audit.conclusion ?? ""} className="input" />
          </Field>
        </div>
      ) : (
        <label className="flex items-start gap-2 self-start text-sm md:col-span-2">
          <input type="checkbox" name="fillChecklist" defaultChecked className="mt-1" />
          <span>
            Checklist direct vullen met alle eisen van de gekozen normen
            <span className="block text-xs text-neutral-500">Je kunt de checklist daarna inperken tot de eisen die je echt toetst.</span>
          </span>
        </label>
      )}
      <div className="md:col-span-4">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </Form>
  );
}
