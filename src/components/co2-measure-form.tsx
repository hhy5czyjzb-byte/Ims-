import type { Action, ActionCo2 } from "@prisma/client";
import type { ActionResult } from "@/lib/action-result";
import { Field, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { STREAM_GROUPS } from "@/lib/co2";
import { ACTION_STATUS_LABEL, options } from "@/lib/labels";
import { toDateInput } from "@/lib/format";

type Opt = { value: string; label: string };
const num = (v: unknown) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

/** Maatregel uit het plan van aanpak (kolommen als in het CO2-dashboard). */
export function Co2MeasureForm({
  action,
  formAction,
  lookups,
  submitLabel,
}: {
  action?: Action & { co2Measure: ActionCo2 | null };
  formAction: (fd: FormData) => Promise<ActionResult>;
  lookups: { users: Opt[]; carriers: Opt[]; targets: Opt[] };
  submitLabel: string;
}) {
  const c = action?.co2Measure;
  const t = (name: keyof ActionCo2, label: string, span = "md:col-span-2", rows = 2) => (
    <Field label={label} className={span}>
      <textarea name={name} rows={rows} defaultValue={(c?.[name] as string | null) ?? ""} className="input" />
    </Field>
  );
  return (
    <Form action={formAction} resetOnSuccess={!action} className="grid gap-3 md:grid-cols-4">
      <Field label="Maatregel" className="md:col-span-3">
        <input name="title" required maxLength={300} defaultValue={action?.title} className="input" />
      </Field>
      <Field label="Emissiestroom">
        <select name="streamGroup" defaultValue={c?.streamGroup ?? "Scope 1 - Brandstofverbruik"} className="input">
          {STREAM_GROUPS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Toelichting maatregel" className="md:col-span-4">
        <textarea name="description" rows={2} defaultValue={action?.description ?? ""} className="input" />
      </Field>
      <Field label="Reductie op de emissiestroom (%)" hint="Zoals in 'PVA - berekening doelstelling'; de app rekent de verwachte reductie in ton uit.">
        <input name="reductionPct" inputMode="decimal" defaultValue={num(c?.reductionPct)} className="input" placeholder="bijv. 1,8" />
      </Field>
      <Field label="Reductie op energie (%)">
        <input name="energyReductionPct" inputMode="decimal" defaultValue={num(c?.energyReductionPct)} className="input" />
      </Field>
      <Field label="Alleen op energiedrager (optioneel)" className="md:col-span-2">
        <Select name="carrierId" options={lookups.carriers} defaultValue={c?.carrierId} placeholder="Hele emissiestroom" />
      </Field>
      <Field label="SKAO of eigen maatregel">
        <select name="skao" defaultValue={c?.skao ?? ""} className="input">
          <option value="">—</option>
          <option value="Eigen maatregel">Eigen maatregel</option>
          <option value="SKAO">SKAO</option>
          <option value="SKAO/Eigen maatregel">SKAO/Eigen maatregel</option>
          {c?.skao && !["Eigen maatregel", "SKAO", "SKAO/Eigen maatregel"].includes(c.skao) && <option value={c.skao}>{c.skao}</option>}
        </select>
      </Field>
      <Field label="SKAO-categorie">
        <select name="skaoCategory" defaultValue={c?.skaoCategory ?? ""} className="input">
          <option value="">—</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
        </select>
      </Field>
      <Field label="Termijn">
        <select name="term" defaultValue={c?.term ?? ""} className="input">
          <option value="">—</option>
          <option value="Korte termijn">Korte termijn</option>
          <option value="Middellange termijn">Middellange termijn</option>
          <option value="Lange termijn">Lange termijn</option>
        </select>
      </Field>
      <Field label="Deadline">
        <input name="deadline" type="date" defaultValue={toDateInput(action?.deadline)} className="input" />
      </Field>
      <Field label="Verantwoordelijke (gebruiker)">
        <Select name="ownerId" options={lookups.users} defaultValue={action?.ownerId} placeholder="—" />
      </Field>
      <Field label="Of verantwoordelijke (functie)">
        <input name="ownerText" maxLength={200} defaultValue={action?.ownerText ?? ""} className="input" />
      </Field>
      <Field label="Doelstelling">
        <Select name="reductionTargetId" options={lookups.targets} defaultValue={action?.reductionTargetId} placeholder="—" />
      </Field>
      {action && (
        <Field label="Status">
          <Select name="status" options={options(ACTION_STATUS_LABEL)} defaultValue={action.status} />
        </Field>
      )}
      {t("planning", "Planning")}
      {t("progressNote", "Voortgang (status update per jaar)")}
      {t("currentYearActions", "Actiepunten huidig jaar")}
      {t("resources", "Benodigde middelen / voorbereidende acties")}
      <details className="md:col-span-4">
        <summary className="cursor-pointer text-sm text-neutral-600">
          Meer velden (vanaf trede 2: TRL, flexibiliteit, investering, wetgeving, waardeketen, …)
        </summary>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <Field label="Type maatregel">
            <input name="measureType" defaultValue={c?.measureType ?? ""} className="input" />
          </Field>
          <Field label="TRL">
            <input name="trl" defaultValue={c?.trl ?? ""} className="input" placeholder="bijv. Gevestigde technologie" />
          </Field>
          <Field label="Investering">
            <input name="investment" defaultValue={c?.investment ?? ""} className="input" />
          </Field>
          <Field label="Kennisbehoefte">
            <input name="knowledgeNeed" defaultValue={c?.knowledgeNeed ?? ""} className="input" />
          </Field>
          {t("flexibilityImpact", "Invloed flexibiliteit energiesysteem")}
          {t("legislation", "Wetgeving")}
          {t("valueChain", "Toepassing op waardeketen")}
          {t("tenderAdvantage", "Van toepassing op project met gunningvoordeel")}
          {t("notApplicableReason", "Onderbouwing indien niet van toepassing", "md:col-span-4")}
        </div>
      </details>
      <div className="md:col-span-4">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </Form>
  );
}
