import type { LegalRequirement } from "@prisma/client";
import type { ActionResult } from "@/lib/action-result";
import { Field, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { CheckboxPicker } from "@/components/checkbox-picker";
import { SubmitButton } from "@/components/submit-button";
import { LEGAL_CATEGORY_LABEL, options } from "@/lib/labels";
import { toDateInput } from "@/lib/format";

type Opt = { value: string; label: string };

export function LegalForm({
  req,
  formAction,
  lookups,
  linkOptions,
  submitLabel,
}: {
  req?: LegalRequirement & { processes: { id: string }[]; documents: { id: string }[]; risks: { id: string }[]; requirements: { id: string }[] };
  formAction: (formData: FormData) => Promise<ActionResult>;
  lookups: { users: Opt[]; disciplines: Opt[]; locations: Opt[] };
  linkOptions: { processes: Opt[]; documents: Opt[]; risks: Opt[]; requirementGroups: { norm: string; options: Opt[] }[] };
  submitLabel: string;
}) {
  return (
    <Form action={formAction} className="grid gap-4 md:grid-cols-4">
      <Field label="Wet / regeling" className="md:col-span-2">
        <input name="title" required maxLength={300} defaultValue={req?.title} className="input" placeholder="Bijv. Besluit activiteiten leefomgeving (Bal)" />
      </Field>
      <Field label="Artikel / onderdeel">
        <input name="article" maxLength={300} defaultValue={req?.article ?? ""} className="input" placeholder="Bijv. art. 3.48" />
      </Field>
      <Field label="Categorie">
        <Select name="category" options={options(LEGAL_CATEGORY_LABEL)} defaultValue={req?.category ?? "OTHER"} />
      </Field>
      <Field label="Onderwerp" className="md:col-span-2">
        <input name="subject" maxLength={300} defaultValue={req?.subject ?? ""} className="input" placeholder="Bijv. Opslag van afvalstoffen" />
      </Field>
      <Field label="Bevoegd gezag / bron">
        <input name="source" maxLength={300} defaultValue={req?.source ?? ""} className="input" placeholder="Bijv. Omgevingsdienst" />
      </Field>
      <Field label="Kenmerk in bronregister" hint="Gebruikt bij herimport">
        <input name="externalRef" maxLength={100} defaultValue={req?.externalRef ?? ""} className="input" />
      </Field>
      <Field label="De eis (wat moet je doen?)" className="md:col-span-4">
        <textarea name="description" rows={3} defaultValue={req?.description ?? ""} className="input" />
      </Field>
      <Field label="Link naar de wettekst (https)" className="md:col-span-4">
        <input
          name="sourceUrl"
          type="url"
          pattern="https://.*"
          defaultValue={req?.sourceUrl ?? ""}
          className="input"
          placeholder="https://wetten.overheid.nl/…"
        />
      </Field>
      <Field label="Eigenaar">
        <Select name="ownerId" options={lookups.users} defaultValue={req?.ownerId} placeholder="— Kies —" />
      </Field>
      <Field label="Discipline">
        <Select name="disciplineId" options={lookups.disciplines} defaultValue={req?.disciplineId} placeholder="Bedrijfsbreed" />
      </Field>
      <Field label="Locatie">
        <Select name="locationId" options={lookups.locations} defaultValue={req?.locationId} placeholder="Alle locaties" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Toetsen elke (mnd)">
          <input name="reviewIntervalMonths" type="number" min={1} max={120} required defaultValue={req?.reviewIntervalMonths ?? 12} className="input" />
        </Field>
        <Field label="Volgende toetsing">
          <input name="nextReviewDate" type="date" defaultValue={toDateInput(req?.nextReviewDate)} className="input" />
        </Field>
      </div>
      {req && (
        <label className="flex items-center gap-2 text-sm md:col-span-4">
          <input type="checkbox" name="active" defaultChecked={req.active} /> Actief (uitvinken als de eis is vervallen of niet meer relevant is)
        </label>
      )}
      <Field label="Normeisen (bijv. ISO 14001 6.1.3)" className="md:col-span-2" group>
        <CheckboxPicker
          name="requirementIds"
          groups={linkOptions.requirementGroups.map((g) => ({ label: g.norm, options: g.options }))}
          selected={req?.requirements.map((r) => r.id) ?? []}
          height="10rem"
        />
      </Field>
      <Field label="Processen" className="md:col-span-2" group>
        <CheckboxPicker
          name="processIds"
          groups={[{ label: "Processen", options: linkOptions.processes }]}
          selected={req?.processes.map((p) => p.id) ?? []}
          height="10rem"
        />
      </Field>
      <Field label="Documenten" className="md:col-span-2" group>
        <CheckboxPicker
          name="documentIds"
          groups={[{ label: "Documenten", options: linkOptions.documents }]}
          selected={req?.documents.map((d) => d.id) ?? []}
          height="10rem"
        />
      </Field>
      <Field label="Risico's en kansen" className="md:col-span-2" group>
        <CheckboxPicker
          name="riskIds"
          groups={[{ label: "Risico's", options: linkOptions.risks }]}
          selected={req?.risks.map((r) => r.id) ?? []}
          height="10rem"
        />
      </Field>
      <div className="md:col-span-4">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </Form>
  );
}
