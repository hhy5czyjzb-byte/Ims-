import type { EnvironmentalAspect } from "@prisma/client";
import type { ActionResult } from "@/lib/action-result";
import { Field, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { CheckboxPicker } from "@/components/checkbox-picker";
import { SubmitButton } from "@/components/submit-button";
import { AspectAssessmentFields } from "@/components/aspect-assessment-fields";
import { LIFECYCLE_PHASES, LIFECYCLE_SCORE_LABEL } from "@/lib/aspects";
import { ASPECT_SITE_TYPE_LABEL, SITUATION_LABEL, options } from "@/lib/labels";
import { toDateInput } from "@/lib/format";

type Opt = { value: string; label: string };
export type AspectLinkOptions = { processes: Opt[]; risks: Opt[]; legal: Opt[]; requirementGroups: { norm: string; options: Opt[] }[] };
/** Keuzes uit het bestaande register (datalist), zodat schrijfwijzen gelijk blijven. */
export type AspectSuggestions = {
  businessUnits: string[];
  locations: string[];
  activities: string[];
  themes: string[];
  contextFactors: string[];
  owners: string[];
};

const n = (v: unknown) => (v === null || v === undefined ? null : Number(String(v)));

function DataList({ id, values }: { id: string; values: string[] }) {
  return (
    <datalist id={id}>
      {values.map((v) => (
        <option key={v} value={v} />
      ))}
    </datalist>
  );
}

export function AspectForm({
  aspect,
  formAction,
  lookups,
  linkOptions,
  suggestions,
  submitLabel,
}: {
  aspect?: EnvironmentalAspect & { processes: { id: string }[]; risks: { id: string }[]; legalRequirements: { id: string }[]; requirements: { id: string }[] };
  formAction: (formData: FormData) => Promise<ActionResult>;
  lookups: { users: Opt[]; disciplines: Opt[]; locations: Opt[] };
  linkOptions: AspectLinkOptions;
  suggestions: AspectSuggestions;
  submitLabel: string;
}) {
  const p = aspect?.id ?? "nieuw";
  return (
    <Form action={formAction} className="grid gap-4 md:grid-cols-4">
      <DataList id={`bu-${p}`} values={suggestions.businessUnits} />
      <DataList id={`loc-${p}`} values={suggestions.locations} />
      <DataList id={`act-${p}`} values={suggestions.activities} />
      <DataList id={`theme-${p}`} values={suggestions.themes} />
      <DataList id={`ctx-${p}`} values={suggestions.contextFactors} />
      <DataList id={`own-${p}`} values={suggestions.owners} />

      <Field label="Bedrijfsonderdeel">
        <input name="businessUnit" list={`bu-${p}`} maxLength={200} defaultValue={aspect?.businessUnit ?? ""} className="input" />
      </Field>
      <Field label="Locatie">
        <input
          name="locationText"
          list={`loc-${p}`}
          maxLength={200}
          defaultValue={aspect?.locationText ?? ""}
          className="input"
          placeholder="Bijv. Groenlo, Project / werk"
        />
      </Field>
      <Field label="Type">
        <Select name="siteType" options={options(ASPECT_SITE_TYPE_LABEL)} defaultValue={aspect?.siteType ?? "SITE"} />
      </Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" name="inOperation" defaultChecked={aspect?.inOperation ?? true} /> Locatie in werking
      </label>
      <Field label="Activiteit" className="md:col-span-2">
        <input
          name="activity"
          list={`act-${p}`}
          required
          maxLength={300}
          defaultValue={aspect?.activity}
          className="input"
          placeholder="Bijv. Op- en overslag"
        />
      </Field>
      <Field label="Milieuthema">
        <input name="theme" list={`theme-${p}`} maxLength={200} defaultValue={aspect?.theme ?? ""} className="input" placeholder="Bijv. Geluid" />
      </Field>
      <Field label="Situatie">
        <Select name="situation" options={options(SITUATION_LABEL)} defaultValue={aspect?.situation ?? "NORMAL"} />
      </Field>
      <Field label="Milieuaspect" className="md:col-span-2">
        <input name="aspect" required maxLength={500} defaultValue={aspect?.aspect} className="input" />
      </Field>
      <Field label="Milieueffect" className="md:col-span-2">
        <input name="impact" maxLength={2000} defaultValue={aspect?.impact ?? ""} className="input" placeholder="Bijv. hinder, bodemverontreiniging" />
      </Field>
      <Field label="MBA (Bal)" className="md:col-span-2">
        <input name="mba" maxLength={2000} defaultValue={aspect?.mba ?? ""} className="input" placeholder="Milieubelastende activiteit, bijv. §3.5.11" />
      </Field>
      <Field label="Contextfactor" className="md:col-span-2">
        <input name="contextFactor" list={`ctx-${p}`} maxLength={300} defaultValue={aspect?.contextFactor ?? ""} className="input" />
      </Field>
      <Field label="Wet- en regelgeving (omschrijving)" className="md:col-span-3">
        <input name="legalText" maxLength={5000} defaultValue={aspect?.legalText ?? ""} className="input" />
      </Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" name="legalApplies" defaultChecked={aspect?.legalApplies ?? false} /> Wettelijke eis van toepassing
      </label>
      <Field label="Stakeholders" className="md:col-span-3">
        <input
          name="stakeholders"
          maxLength={2000}
          defaultValue={aspect?.stakeholders ?? ""}
          className="input"
          placeholder="Bijv. Gemeente, Provincie, Omgeving"
        />
      </Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" name="complaints" defaultChecked={aspect?.complaints ?? false} /> Klachten bekend
      </label>
      <Field label="Voorzieningen / beheersmaatregelen" className="md:col-span-4">
        <textarea name="controls" rows={2} defaultValue={aspect?.controls ?? ""} className="input" />
      </Field>

      <AspectAssessmentFields
        defaults={
          aspect && {
            effectScore: n(aspect.effectScore),
            exposure: n(aspect.exposure),
            probability: n(aspect.probability),
            opportunity: aspect.opportunity,
            priority: aspect.priority ?? "",
            priorityRationale: aspect.priorityRationale,
          }
        }
      />

      <fieldset className="rounded-md border border-neutral-200 p-3 md:col-span-4">
        <legend className="px-1 text-sm font-medium">Levenscyclusperspectief (invloed per fase; leeg = n.v.t.)</legend>
        <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {LIFECYCLE_PHASES.map((ph) => (
            <label key={ph.key} className="block">
              <span className="mb-1 block text-xs text-neutral-600">{ph.label}</span>
              <select name={ph.key} defaultValue={aspect?.[ph.key] ?? ""} className="input">
                <option value="">—</option>
                {[1, 2, 3].map((v) => (
                  <option key={v} value={v}>
                    {v} · {LIFECYCLE_SCORE_LABEL[v]}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-600">Bron</span>
            <input name="lifecycleSource" list="lc-bron" maxLength={200} defaultValue={aspect?.lifecycleSource ?? ""} className="input" />
            <datalist id="lc-bron">
              <option value="MAR 2025" />
              <option value="Concept 2026" />
              <option value="Vastgesteld" />
            </datalist>
          </label>
        </div>
      </fieldset>

      <Field label="Maatregel / doelstelling" className="md:col-span-4">
        <input name="measure" maxLength={5000} defaultValue={aspect?.measure ?? ""} className="input" />
      </Field>
      <Field label="Eigenaar (functie)">
        <input name="ownerText" list={`own-${p}`} maxLength={200} defaultValue={aspect?.ownerText ?? ""} className="input" />
      </Field>
      <Field label="Eigenaar (gebruiker)">
        <Select name="ownerId" options={lookups.users} defaultValue={aspect?.ownerId} placeholder="— Geen —" />
      </Field>
      <Field label="Discipline (BU)">
        <Select name="disciplineId" options={lookups.disciplines} defaultValue={aspect?.disciplineId} placeholder="Bedrijfsbreed" />
      </Field>
      <Field label="Vestiging (koppeling)">
        <Select name="locationId" options={lookups.locations} defaultValue={aspect?.locationId} placeholder="—" />
      </Field>
      <Field label="Nr. (eigen register)" hint="Gebruikt bij herimport">
        <input name="externalRef" maxLength={100} defaultValue={aspect?.externalRef ?? ""} className="input" />
      </Field>
      <Field label="Herkomst">
        <input name="origin" maxLength={200} defaultValue={aspect?.origin ?? ""} className="input" placeholder="Bijv. MAR 2025" />
      </Field>
      <Field label="Volgende beoordeling">
        <input name="reviewDate" type="date" defaultValue={toDateInput(aspect?.reviewDate)} className="input" />
      </Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" name="co2Relevant" defaultChecked={aspect?.co2Relevant ?? false} /> Relevant voor CO2
      </label>
      {aspect && (
        <label className="flex items-center gap-2 text-sm md:col-span-4">
          <input type="checkbox" name="active" defaultChecked={aspect.active} /> Actief (uitvinken als het aspect is vervallen)
        </label>
      )}
      <Field label="Wet- en regelgeving (register nr.)" className="md:col-span-2" group>
        <CheckboxPicker
          name="legalIds"
          groups={[{ label: "Wettelijke eisen", options: linkOptions.legal }]}
          selected={aspect?.legalRequirements.map((l) => l.id) ?? []}
          height="10rem"
        />
      </Field>
      <Field label="Risico's en kansen" className="md:col-span-2" group>
        <CheckboxPicker
          name="riskIds"
          groups={[{ label: "Risico's en kansen", options: linkOptions.risks }]}
          selected={aspect?.risks.map((r) => r.id) ?? []}
          height="10rem"
        />
      </Field>
      <Field label="Processen" className="md:col-span-2" group>
        <CheckboxPicker
          name="processIds"
          groups={[{ label: "Processen", options: linkOptions.processes }]}
          selected={aspect?.processes.map((x) => x.id) ?? []}
          height="10rem"
        />
      </Field>
      <Field label="Normeisen (bijv. ISO 14001 6.1.2)" className="md:col-span-2" group>
        <CheckboxPicker
          name="requirementIds"
          groups={linkOptions.requirementGroups.map((g) => ({ label: g.norm, options: g.options }))}
          selected={aspect?.requirements.map((r) => r.id) ?? []}
          height="10rem"
        />
      </Field>
      <div className="md:col-span-4">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </Form>
  );
}
