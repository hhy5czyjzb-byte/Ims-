import type { EnvironmentalAspect } from "@prisma/client";
import type { ActionResult } from "@/lib/action-result";
import { Field, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { CheckboxPicker } from "@/components/checkbox-picker";
import { SubmitButton } from "@/components/submit-button";
import { AspectScoringFields } from "@/components/aspect-scoring-fields";
import { ASPECT_TYPE_LABEL, SITUATION_LABEL, options } from "@/lib/labels";
import { toDateInput } from "@/lib/format";

type Opt = { value: string; label: string };
export type AspectLinkOptions = { processes: Opt[]; risks: Opt[]; legal: Opt[]; requirementGroups: { norm: string; options: Opt[] }[] };

export function AspectForm({
  aspect,
  formAction,
  lookups,
  linkOptions,
  threshold,
  submitLabel,
}: {
  aspect?: EnvironmentalAspect & { processes: { id: string }[]; risks: { id: string }[]; legalRequirements: { id: string }[]; requirements: { id: string }[] };
  formAction: (formData: FormData) => Promise<ActionResult>;
  lookups: { users: Opt[]; disciplines: Opt[]; locations: Opt[] };
  linkOptions: AspectLinkOptions;
  threshold: number;
  submitLabel: string;
}) {
  return (
    <Form action={formAction} className="grid gap-4 md:grid-cols-4">
      <Field label="Activiteit" className="md:col-span-2">
        <input name="activity" required maxLength={300} defaultValue={aspect?.activity} className="input" placeholder="Bijv. Breken van puin" />
      </Field>
      <Field label="Milieuaspect" className="md:col-span-2">
        <input name="aspect" required maxLength={300} defaultValue={aspect?.aspect} className="input" placeholder="Bijv. Stofemissie" />
      </Field>
      <Field label="Type aspect">
        <Select name="aspectType" options={options(ASPECT_TYPE_LABEL)} defaultValue={aspect?.aspectType ?? "OTHER"} />
      </Field>
      <Field label="Situatie">
        <Select name="situation" options={options(SITUATION_LABEL)} defaultValue={aspect?.situation ?? "NORMAL"} />
      </Field>
      <Field label="Milieueffect" className="md:col-span-2">
        <input
          name="impact"
          maxLength={5000}
          defaultValue={aspect?.impact ?? ""}
          className="input"
          placeholder="Bijv. Luchtverontreiniging, hinder omwonenden"
        />
      </Field>
      <AspectScoringFields
        threshold={threshold}
        defaults={
          aspect && {
            frequency: aspect.frequency,
            severity: aspect.severity,
            extent: aspect.extent,
            score: aspect.score,
            legalApplies: aspect.legalApplies,
            stakeholderConcern: aspect.stakeholderConcern,
            significanceManual: aspect.significanceManual,
            significant: aspect.significant,
            significanceReason: aspect.significanceReason,
          }
        }
      />
      <Field label="Beheersmaatregelen" className="md:col-span-4">
        <textarea name="controls" rows={3} defaultValue={aspect?.controls ?? ""} className="input" />
      </Field>
      <Field label="Eigenaar">
        <Select name="ownerId" options={lookups.users} defaultValue={aspect?.ownerId} placeholder="— Kies —" />
      </Field>
      <Field label="Discipline">
        <Select name="disciplineId" options={lookups.disciplines} defaultValue={aspect?.disciplineId} placeholder="Bedrijfsbreed" />
      </Field>
      <Field label="Locatie">
        <Select name="locationId" options={lookups.locations} defaultValue={aspect?.locationId} placeholder="Alle locaties" />
      </Field>
      <Field label="Volgende beoordeling">
        <input name="reviewDate" type="date" defaultValue={toDateInput(aspect?.reviewDate)} className="input" />
      </Field>
      <Field label="Kenmerk in bronregister" hint="Gebruikt bij herimport">
        <input name="externalRef" maxLength={100} defaultValue={aspect?.externalRef ?? ""} className="input" />
      </Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm md:col-span-3">
        <input type="checkbox" name="co2Relevant" defaultChecked={aspect?.co2Relevant ?? false} /> Relevant voor de CO2-prestatieladder (energie / emissies)
      </label>
      {aspect && (
        <label className="flex items-center gap-2 text-sm md:col-span-4">
          <input type="checkbox" name="active" defaultChecked={aspect.active} /> Actief (uitvinken als de activiteit niet meer plaatsvindt)
        </label>
      )}
      <Field label="Wet- en regelgeving" className="md:col-span-2" group>
        <CheckboxPicker
          name="legalIds"
          groups={[{ label: "Wettelijke eisen", options: linkOptions.legal }]}
          selected={aspect?.legalRequirements.map((l) => l.id) ?? []}
          height="10rem"
        />
      </Field>
      <Field label="Processen" className="md:col-span-2" group>
        <CheckboxPicker
          name="processIds"
          groups={[{ label: "Processen", options: linkOptions.processes }]}
          selected={aspect?.processes.map((p) => p.id) ?? []}
          height="10rem"
        />
      </Field>
      <Field label="Risico's en kansen" className="md:col-span-2" group>
        <CheckboxPicker
          name="riskIds"
          groups={[{ label: "Risico's", options: linkOptions.risks }]}
          selected={aspect?.risks.map((r) => r.id) ?? []}
          height="10rem"
        />
      </Field>
      <Field label="Normeisen (bijv. ISO 14001 6.1.2, CO2-prestatieladder)" className="md:col-span-2" group>
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
