import type { NormRequirement, Process, Risk } from "@prisma/client";
import type { ActionResult } from "@/lib/action-result";
import { Field, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { CheckboxPicker } from "@/components/checkbox-picker";
import { SubmitButton } from "@/components/submit-button";
import { RiskAssessmentFields } from "@/components/risk-assessment-fields";
import { RISK_CATEGORY_LABEL, RISK_STATUS_LABEL, options } from "@/lib/labels";
import { toDateInput } from "@/lib/format";

type Opt = { value: string; label: string };

export function RiskForm({
  risk,
  formAction,
  lookups,
  processOptions,
  requirementGroups,
  submitLabel,
}: {
  risk?: Risk & { processes: Pick<Process, "id">[]; requirements: Pick<NormRequirement, "id">[] };
  formAction: (formData: FormData) => Promise<ActionResult>;
  lookups: { users: Opt[]; disciplines: Opt[]; locations: Opt[] };
  processOptions: Opt[];
  requirementGroups: { norm: string; options: Opt[] }[];
  submitLabel: string;
}) {
  return (
    <Form action={formAction} className="grid gap-4 md:grid-cols-4">
      <Field label="Titel" className="md:col-span-3">
        <input name="title" required maxLength={300} defaultValue={risk?.title} className="input" placeholder="Bijv. Stofemissie bij breken van puin" />
      </Field>
      <Field label="Categorie">
        <Select name="category" options={options(RISK_CATEGORY_LABEL)} defaultValue={risk?.category ?? "OTHER"} />
      </Field>
      <RiskAssessmentFields
        defaults={
          risk && {
            type: risk.type,
            likelihoodBefore: risk.likelihoodBefore,
            impactBefore: risk.impactBefore,
            likelihoodAfter: risk.likelihoodAfter,
            impactAfter: risk.impactAfter,
          }
        }
      />
      <Field label="Omschrijving" className="md:col-span-4">
        <textarea name="description" rows={2} defaultValue={risk?.description ?? ""} className="input" />
      </Field>
      <Field label="Oorzaak" className="md:col-span-2">
        <textarea name="cause" rows={2} defaultValue={risk?.cause ?? ""} className="input" />
      </Field>
      <Field label="Gevolg" className="md:col-span-2">
        <textarea name="consequence" rows={2} defaultValue={risk?.consequence ?? ""} className="input" />
      </Field>
      <Field label="Beheersmaatregelen (bestaand en gepland)" className="md:col-span-4">
        <textarea name="measures" rows={3} defaultValue={risk?.measures ?? ""} className="input" />
      </Field>
      <Field label="Eigenaar">
        <Select name="ownerId" options={lookups.users} defaultValue={risk?.ownerId} placeholder="— Kies —" />
      </Field>
      <Field label="Discipline">
        <Select name="disciplineId" options={lookups.disciplines} defaultValue={risk?.disciplineId} placeholder="Bedrijfsbreed" />
      </Field>
      <Field label="Locatie">
        <Select name="locationId" options={lookups.locations} defaultValue={risk?.locationId} placeholder="Alle locaties" />
      </Field>
      <Field label="Volgende beoordeling">
        <input name="reviewDate" type="date" defaultValue={toDateInput(risk?.reviewDate)} className="input" />
      </Field>
      {risk && (
        <Field label="Status">
          <Select name="status" options={options(RISK_STATUS_LABEL)} defaultValue={risk.status} />
        </Field>
      )}
      <Field label="Processen" className="md:col-span-2" group>
        <CheckboxPicker
          name="processIds"
          groups={[{ label: "Processen", options: processOptions }]}
          selected={risk?.processes.map((p) => p.id) ?? []}
          height="10rem"
        />
      </Field>
      <Field label="Normeisen" className="md:col-span-2" group>
        <CheckboxPicker
          name="requirementIds"
          groups={requirementGroups.map((g) => ({ label: g.norm, options: g.options }))}
          selected={risk?.requirements.map((r) => r.id) ?? []}
          height="10rem"
        />
      </Field>
      <div className="md:col-span-4">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </Form>
  );
}
