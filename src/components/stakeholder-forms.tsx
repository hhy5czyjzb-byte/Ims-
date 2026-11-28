import type { Stakeholder, StakeholderObligation } from "@prisma/client";
import type { ActionResult } from "@/lib/action-result";
import { OBLIGATION_CHARACTER_LABEL, STAKEHOLDER_TYPE_LABEL, options } from "@/lib/labels";
import { Field, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { CheckboxPicker } from "@/components/checkbox-picker";

export function StakeholderFields({
  stakeholder,
  formAction,
  influences,
  submitLabel,
  reset,
}: {
  stakeholder?: Stakeholder;
  formAction: (fd: FormData) => Promise<ActionResult>;
  influences: string[];
  submitLabel: string;
  reset?: boolean;
}) {
  const listId = `infl-${stakeholder?.id ?? "nieuw"}`;
  return (
    <Form key={stakeholder?.updatedAt.toISOString()} action={formAction} resetOnSuccess={reset} className="mt-2 grid gap-3 md:grid-cols-4">
      <Field label="Naam" className="md:col-span-2">
        <input name="name" required maxLength={300} defaultValue={stakeholder?.name} className="input" />
      </Field>
      <Field label="Intern / extern">
        <Select name="type" options={options(STAKEHOLDER_TYPE_LABEL)} defaultValue={stakeholder?.type ?? "EXTERNAL"} />
      </Field>
      <Field label="Invloed">
        <input name="influenceLevel" list={listId} maxLength={50} defaultValue={stakeholder?.influenceLevel ?? ""} className="input" />
        <datalist id={listId}>
          {influences.map((i) => (
            <option key={i} value={i} />
          ))}
        </datalist>
      </Field>
      <Field label="Wat zij van ons verwachten" className="md:col-span-2">
        <textarea name="expectations" rows={2} maxLength={2000} defaultValue={stakeholder?.expectations ?? ""} className="input" />
      </Field>
      <Field label="Hoe we hierop inspelen" className="md:col-span-2">
        <textarea name="howAddressed" rows={2} maxLength={2000} defaultValue={stakeholder?.howAddressed ?? ""} className="input" />
      </Field>
      <Field label="Volgorde">
        <input name="sortOrder" type="number" min={0} defaultValue={stakeholder?.sortOrder ?? ""} className="input" />
      </Field>
      {stakeholder && (
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={stakeholder.active} /> Actief
        </label>
      )}
      <div className="self-end">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </Form>
  );
}

export function ObligationFields({
  obligation,
  selectedStakeholders,
  selectedLegal,
  stakeholderOptions,
  legalOptions,
  formAction,
  submitLabel,
  reset,
}: {
  obligation?: StakeholderObligation;
  selectedStakeholders: string[];
  selectedLegal: string[];
  stakeholderOptions: { value: string; label: string }[];
  legalOptions: { value: string; label: string }[];
  formAction: (fd: FormData) => Promise<ActionResult>;
  submitLabel: string;
  reset?: boolean;
}) {
  return (
    <Form key={obligation?.updatedAt.toISOString()} action={formAction} resetOnSuccess={reset} className="mt-2 grid gap-3 md:grid-cols-4">
      <Field label="Belanghebbende(n)" className="md:col-span-2">
        <input name="stakeholderText" required maxLength={300} defaultValue={obligation?.stakeholderText} className="input" />
      </Field>
      <Field label="Karakter">
        <Select name="character" options={options(OBLIGATION_CHARACTER_LABEL)} defaultValue={obligation?.character ?? "LEGAL"} />
      </Field>
      <div />
      <Field label="Verplichting" className="md:col-span-4">
        <textarea name="obligation" required rows={2} maxLength={2000} defaultValue={obligation?.obligation} className="input" />
      </Field>
      <Field label="Stakeholders" className="md:col-span-2" group>
        <CheckboxPicker
          name="stakeholderIds"
          groups={[{ label: "Stakeholders", options: stakeholderOptions }]}
          selected={selectedStakeholders}
          height="10rem"
        />
      </Field>
      <Field label="Wettelijke eisen (register)" className="md:col-span-2" group>
        <CheckboxPicker name="legalIds" groups={[{ label: "Wet- en regelgeving", options: legalOptions }]} selected={selectedLegal} height="10rem" />
      </Field>
      <div className="md:col-span-4">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </Form>
  );
}
