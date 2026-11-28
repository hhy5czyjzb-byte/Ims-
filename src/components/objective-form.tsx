import type { Objective } from "@prisma/client";
import type { ActionResult } from "@/lib/action-result";
import { Field, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { CheckboxPicker } from "@/components/checkbox-picker";
import { OBJECTIVE_CATEGORY_LABEL, options } from "@/lib/labels";
import { toDateInput } from "@/lib/format";

type Opt = { value: string; label: string };
const num = (v: unknown) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

/** Doelstelling aanmaken of wijzigen (SMART: indicator, nulmeting, streefwaarde, eigenaar, termijn). */
export function ObjectiveForm({
  objective,
  formAction,
  lookups,
  submitLabel,
}: {
  objective?: Objective & { norms: { id: string }[]; requirements: { id: string }[] };
  formAction: (fd: FormData) => Promise<ActionResult>;
  lookups: { users: Opt[]; disciplines: Opt[]; norms: Opt[]; requirementGroups: { norm: string; options: Opt[] }[]; reductionTargets: Opt[] };
  submitLabel: string;
}) {
  const o = objective;
  return (
    <Form action={formAction} resetOnSuccess={!o} className="grid gap-3 md:grid-cols-4">
      <Field label="Doelstelling" className="md:col-span-3">
        <input name="title" required maxLength={300} defaultValue={o?.title} className="input" placeholder="Bijv. Minder ongevallen met verzuim" />
      </Field>
      <Field label="Categorie">
        <Select name="category" options={options(OBJECTIVE_CATEGORY_LABEL)} defaultValue={o?.category ?? "QUALITY"} />
      </Field>
      <Field label="Toelichting" className="md:col-span-4">
        <textarea name="description" rows={2} defaultValue={o?.description ?? ""} className="input" />
      </Field>
      <Field label="Indicator (meetbaar)" className="md:col-span-2" hint="Waaraan meet je het? Bijv. IF-frequentie, % groene stroom, aantal klachten.">
        <input name="indicator" maxLength={500} defaultValue={o?.indicator ?? ""} className="input" />
      </Field>
      <Field label="Nulmeting (tekst)">
        <input name="baselineText" maxLength={300} defaultValue={o?.baselineText ?? ""} className="input" placeholder="Bijv. IF 4,5 (2024)" />
      </Field>
      <Field label="Streefwaarde (tekst)">
        <input name="targetText" maxLength={300} defaultValue={o?.targetText ?? ""} className="input" placeholder="Bijv. IF ≤ 3,8" />
      </Field>
      <Field label="Nulmeting (getal)" hint="Optioneel; met streefwaarde en gemeten waarde berekent de app de voortgang.">
        <input name="baselineValue" inputMode="decimal" defaultValue={num(o?.baselineValue)} className="input" />
      </Field>
      <Field label="Streefwaarde (getal)">
        <input name="targetValue" inputMode="decimal" defaultValue={num(o?.targetValue)} className="input" />
      </Field>
      <Field label="Eenheid">
        <input name="unit" maxLength={40} defaultValue={o?.unit ?? ""} className="input" placeholder="%, t CO2, IF, …" />
      </Field>
      <Field label="Beoordelen elke (maanden)">
        <input name="reviewIntervalMonths" type="number" min={1} max={24} defaultValue={o?.reviewIntervalMonths ?? 3} className="input" />
      </Field>
      <Field label="Start">
        <input name="startDate" type="date" defaultValue={toDateInput(o?.startDate)} className="input" />
      </Field>
      <Field label="Deadline">
        <input name="deadline" type="date" defaultValue={toDateInput(o?.deadline)} className="input" />
      </Field>
      <Field label="Of termijn (tekst)">
        <input name="termText" maxLength={100} defaultValue={o?.termText ?? ""} className="input" placeholder="Bijv. Per kwartaal" />
      </Field>
      <Field label="Nr. eigen register">
        <input name="externalRef" maxLength={50} defaultValue={o?.externalRef ?? ""} className="input" />
      </Field>
      <Field label="Eigenaar (gebruiker)">
        <Select name="ownerId" options={lookups.users} defaultValue={o?.ownerId} placeholder="—" />
      </Field>
      <Field label="Of eigenaar (functie)">
        <input name="ownerText" maxLength={200} defaultValue={o?.ownerText ?? ""} className="input" placeholder="Bijv. QHSE-manager" />
      </Field>
      <Field label="Bedrijfsonderdeel">
        <Select name="disciplineId" options={lookups.disciplines} defaultValue={o?.disciplineId} placeholder="Hele groep" />
      </Field>
      <Field label="CO2-reductiedoel (koppeling)">
        <Select name="reductionTargetId" options={lookups.reductionTargets} defaultValue={o?.reductionTargetId} placeholder="—" />
      </Field>
      <Field label="Geldt voor (normen)" className="md:col-span-2" group>
        <CheckboxPicker name="normIds" groups={[{ label: "Normen", options: lookups.norms }]} selected={o?.norms.map((n) => n.id) ?? []} height="9rem" />
      </Field>
      <Field label="Normeisen (bijv. ISO 9001 6.2)" className="md:col-span-2" group>
        <CheckboxPicker
          name="requirementIds"
          groups={lookups.requirementGroups.map((g) => ({ label: g.norm, options: g.options }))}
          selected={o?.requirements.map((r) => r.id) ?? []}
          height="9rem"
        />
      </Field>
      {o && (
        <label className="flex items-center gap-2 text-sm md:col-span-4">
          <input type="checkbox" name="active" defaultChecked={o.active} /> Actief
        </label>
      )}
      <div className="md:col-span-4">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </Form>
  );
}
