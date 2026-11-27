import type { NormRequirement, Process, Risk } from "@prisma/client";
import type { ActionResult } from "@/lib/action-result";
import { Field, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { CheckboxPicker } from "@/components/checkbox-picker";
import { SubmitButton } from "@/components/submit-button";
import { RiskAssessmentFields } from "@/components/risk-assessment-fields";
import { RISK_CATEGORY_LABEL, RISK_STATUS_LABEL, TREATMENT_STATUS_LABEL, options } from "@/lib/labels";
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
  risk?: Risk & { processes: Pick<Process, "id">[]; requirements: Pick<NormRequirement, "id">[]; disciplines: { id: string }[] };
  formAction: (formData: FormData) => Promise<ActionResult>;
  lookups: { users: Opt[]; disciplines: Opt[]; locations: Opt[] };
  processOptions: Opt[];
  requirementGroups: { norm: string; options: Opt[] }[];
  submitLabel: string;
}) {
  return (
    <Form action={formAction} className="grid gap-4 md:grid-cols-4">
      <Field label="Nr. in eigen register" hint="bijv. R12 of K05">
        <input name="externalRef" maxLength={20} defaultValue={risk?.externalRef ?? ""} className="input" />
      </Field>
      <Field label="Omschrijving (titel)" className="md:col-span-3">
        <input name="title" required maxLength={300} defaultValue={risk?.title} className="input" placeholder="Bijv. Stofemissie bij breken van puin" />
      </Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" name="strategic" defaultChecked={risk?.strategic ?? false} /> ★ Strategisch (uit de contextanalyse)
      </label>
      <Field label="Herkomst">
        <input name="origin" list="risk-origin" maxLength={100} defaultValue={risk?.origin ?? ""} className="input" placeholder="Contextanalyse / Aanvullend" />
        <datalist id="risk-origin">
          <option value="Contextanalyse" />
          <option value="Aanvullend" />
        </datalist>
      </Field>
      <Field label="Contextfactor">
        <input name="contextFactor" maxLength={200} defaultValue={risk?.contextFactor ?? ""} className="input" />
      </Field>
      <Field label="Thema">
        <input name="theme" maxLength={200} defaultValue={risk?.theme ?? ""} className="input" />
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
      <Field label="Eigenaar (functie)" hint="bijv. QHSE, BU-directeur Beton">
        <input name="ownerText" maxLength={200} defaultValue={risk?.ownerText ?? ""} className="input" />
      </Field>
      <Field label="Eigenaar (persoon in de app)">
        <Select name="ownerId" options={lookups.users} defaultValue={risk?.ownerId} placeholder="— Kies —" />
      </Field>
      <Field label="Termijn" hint="bijv. Q2 2027, Doorlopend">
        <input name="term" maxLength={50} defaultValue={risk?.term ?? ""} className="input" />
      </Field>
      <Field label="Status aanpak">
        <Select name="treatmentStatus" options={options(TREATMENT_STATUS_LABEL)} defaultValue={risk?.treatmentStatus ?? "OPEN"} />
      </Field>
      <Field label="Monitoring / KPI" className="md:col-span-2">
        <input name="monitoring" maxLength={500} defaultValue={risk?.monitoring ?? ""} className="input" />
      </Field>
      <Field label="Kader" className="md:col-span-2" hint="bijv. ISO 14001, wetgeving">
        <input name="framework" maxLength={300} defaultValue={risk?.framework ?? ""} className="input" />
      </Field>
      <Field label="Locatie">
        <Select name="locationId" options={lookups.locations} defaultValue={risk?.locationId} placeholder="Alle locaties" />
      </Field>
      <Field label="Laatst beoordeeld">
        <input name="lastReviewedAt" type="date" defaultValue={toDateInput(risk?.lastReviewedAt)} className="input" />
      </Field>
      <Field label="Volgende beoordeling">
        <input name="reviewDate" type="date" defaultValue={toDateInput(risk?.reviewDate)} className="input" />
      </Field>
      <Field label="Opmerking" className="md:col-span-2">
        <input name="notes" maxLength={2000} defaultValue={risk?.notes ?? ""} className="input" />
      </Field>
      <Field label="BU's (leeg = groep / bedrijfsbreed)" className="md:col-span-2" group>
        <CheckboxPicker
          name="disciplineIds"
          groups={[{ label: "BU's", options: lookups.disciplines }]}
          selected={risk?.disciplines.map((d) => d.id) ?? []}
          height="8rem"
        />
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
