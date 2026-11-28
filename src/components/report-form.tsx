import type { NormRequirement, Report } from "@prisma/client";
import type { ActionResult } from "@/lib/action-result";
import { Field, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { CheckboxPicker } from "@/components/checkbox-picker";
import { INJURY_LEVEL_LABEL, REPORT_ORIGIN_LABEL, REPORT_SEVERITY_LABEL, REPORT_TYPE_LABEL, options } from "@/lib/labels";
import { toDateInput } from "@/lib/format";
import { ACCIDENT_CATEGORIES } from "@/lib/reports";

type Opt = { value: string; label: string };

/** Melding doen (kort) of behandelen (volledig, met analyse en effectiviteit). */
export function ReportForm({
  report,
  formAction,
  lookups,
  processes,
  requirementGroups,
  full,
  canManage,
  submitLabel,
}: {
  report?: Report & { requirements: Pick<NormRequirement, "id">[] };
  formAction: (fd: FormData) => Promise<ActionResult>;
  lookups: { users: Opt[]; disciplines: Opt[]; locations: Opt[] };
  processes?: Opt[];
  requirementGroups?: { norm: string; options: Opt[] }[];
  full?: boolean;
  canManage?: boolean;
  submitLabel: string;
}) {
  return (
    <Form action={formAction} resetOnSuccess={!report} className="grid gap-3 md:grid-cols-4">
      <Field label="Soort melding">
        <Select name="type" options={options(REPORT_TYPE_LABEL)} defaultValue={report?.type ?? "NONCONFORMITY"} />
      </Field>
      <Field label="Datum voorval">
        <input
          name="occurredAt"
          type="date"
          required
          max={toDateInput(new Date())}
          defaultValue={toDateInput(report?.occurredAt ?? new Date())}
          className="input"
        />
      </Field>
      <Field label="Herkomst">
        <Select name="origin" options={options(REPORT_ORIGIN_LABEL)} defaultValue={report?.origin ?? "INTERNAL"} />
      </Field>
      <Field label="Ernst">
        <Select name="severity" options={options(REPORT_SEVERITY_LABEL)} defaultValue={report?.severity ?? ""} placeholder="—" />
      </Field>
      <Field label="Wat is er gebeurd? (kort)" className="md:col-span-4">
        <input name="title" required maxLength={300} defaultValue={report?.title} className="input" />
      </Field>
      <Field label="Toelichting" className="md:col-span-4">
        <textarea name="description" rows={3} defaultValue={report?.description ?? ""} className="input" />
      </Field>
      <Field label="Vestiging">
        <Select name="locationId" options={lookups.locations} defaultValue={report?.locationId} placeholder="—" />
      </Field>
      <Field label="Of project / werkadres">
        <input name="locationText" maxLength={300} defaultValue={report?.locationText ?? ""} className="input" />
      </Field>
      <Field label="Bedrijfsonderdeel">
        <Select name="disciplineId" options={lookups.disciplines} defaultValue={report?.disciplineId} placeholder="—" />
      </Field>
      <fieldset className="grid gap-3 rounded-md border border-neutral-200 p-3 md:col-span-4 md:grid-cols-4">
        <legend className="px-1 text-sm font-semibold">Bij ongeval of letsel</legend>
        <Field label="Categorie ongeval" className="md:col-span-2">
          <select name="accidentCategory" defaultValue={report?.accidentCategory ?? ""} className="input">
            <option value="">—</option>
            {ACCIDENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            {report?.accidentCategory && !(ACCIDENT_CATEGORIES as readonly string[]).includes(report.accidentCategory) && (
              <option value={report.accidentCategory}>{report.accidentCategory}</option>
            )}
          </select>
        </Field>
        <Field label="Letsel">
          <Select
            name="injury"
            options={options(INJURY_LEVEL_LABEL).filter((o) => o.value !== "FATAL")}
            defaultValue={report?.injury === "FATAL" ? "" : (report?.injury ?? "")}
            placeholder="—"
          />
        </Field>
        <div className="space-y-1 self-end pb-1 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="absenceShort" defaultChecked={report?.absence === "SHORT"} /> Letsel / verzuim 1–15 dagen
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="absenceLong" defaultChecked={report?.absence === "LONG"} /> Verzuim meer dan 15 dagen
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="reportable" defaultChecked={report?.reportable ?? false} /> Meldplichtig (Arbeidsinspectie / bevoegd gezag)
          </label>
          <label className="flex items-center gap-2 font-semibold text-brand-red-dark">
            <input type="checkbox" name="fatal" defaultChecked={report?.injury === "FATAL"} /> Fataal (dodelijk)
          </label>
        </div>
        <p className="text-xs text-neutral-500 md:col-span-4">
          De categorie wordt alleen bewaard bij de soort &lsquo;Ongeval&rsquo;. Zijn de verzuimdagen bekend, dan wordt het vinkje daarop gecontroleerd. Een
          fataal ongeval is altijd meldplichtig.
        </p>
      </fieldset>
      <Field label="Directe maatregel / correctie" className="md:col-span-3">
        <input name="immediateAction" maxLength={5000} defaultValue={report?.immediateAction ?? ""} className="input" placeholder="Wat is er meteen gedaan?" />
      </Field>
      <Field label="Melder (als het niet jijzelf bent)">
        <input name="reporterText" maxLength={200} defaultValue={report?.reporterText ?? ""} className="input" />
      </Field>

      {full && (
        <>
          <div className="mt-2 border-t border-neutral-200 pt-3 text-sm font-semibold md:col-span-4">Behandeling</div>
          {canManage && (
            <>
              <Field label="Behandelaar (gebruiker)">
                <Select name="ownerId" options={lookups.users} defaultValue={report?.ownerId} placeholder="—" />
              </Field>
              <Field label="Of behandelaar (naam / functie)">
                <input name="ownerText" maxLength={200} defaultValue={report?.ownerText ?? ""} className="input" />
              </Field>
              <Field label="Nr. eigen register">
                <input name="externalRef" maxLength={100} defaultValue={report?.externalRef ?? ""} className="input" />
              </Field>
            </>
          )}
          <Field label="Proces">
            <Select name="processId" options={processes ?? []} defaultValue={report?.processId} placeholder="—" />
          </Field>
          <Field label="Verzuimdagen">
            <input name="lostDays" type="number" min={0} defaultValue={report?.lostDays ?? ""} className="input" />
          </Field>
          <Field label="Gemeld aan instantie op">
            <input name="reportedToAuthorityAt" type="date" defaultValue={toDateInput(report?.reportedToAuthorityAt)} className="input" />
          </Field>
          <Field label="Faalkosten (€)">
            <input name="costs" inputMode="decimal" defaultValue={report?.costs ? String(report.costs).replace(".", ",") : ""} className="input" />
          </Field>
          <Field label="Oorzaakanalyse" className="md:col-span-4">
            <textarea name="rootCause" rows={3} defaultValue={report?.rootCause ?? ""} className="input" placeholder="Wat is de onderliggende oorzaak?" />
          </Field>
          <Field label="Methode">
            <input name="rootCauseMethod" list="rc-methods" maxLength={100} defaultValue={report?.rootCauseMethod ?? ""} className="input" />
            <datalist id="rc-methods">
              <option value="5x waarom" />
              <option value="Visgraat (Ishikawa)" />
              <option value="Tripod Beta" />
              <option value="Gesprek / interview" />
            </datalist>
          </Field>
          <Field label="Oorzaakcategorie">
            <input name="causeCategory" list="rc-categories" maxLength={100} defaultValue={report?.causeCategory ?? ""} className="input" />
            <datalist id="rc-categories">
              <option value="Mens / gedrag" />
              <option value="Materieel / middelen" />
              <option value="Methode / werkwijze" />
              <option value="Omgeving" />
              <option value="Organisatie / communicatie" />
              <option value="Leverancier / onderaannemer" />
            </datalist>
          </Field>
          <div className="mt-2 border-t border-neutral-200 pt-3 text-sm font-semibold md:col-span-4">Effectiviteit van de maatregelen</div>
          <Field label="Effectief?">
            <select name="effective" defaultValue={report?.effective === true ? "ja" : report?.effective === false ? "nee" : ""} className="input">
              <option value="">Nog niet beoordeeld</option>
              <option value="ja">Ja, effectief</option>
              <option value="nee">Nee, niet effectief</option>
            </select>
          </Field>
          <Field label="Beoordeeld op">
            <input name="effectivenessCheckedAt" type="date" defaultValue={toDateInput(report?.effectivenessCheckedAt)} className="input" />
          </Field>
          <Field label="Toelichting effectiviteit" className="md:col-span-2">
            <input name="effectivenessNote" maxLength={2000} defaultValue={report?.effectivenessNote ?? ""} className="input" />
          </Field>
          {requirementGroups && (
            <Field label="Normeisen (bijv. ISO 9001 / 14001 §10.2)" className="md:col-span-4" group>
              <CheckboxPicker
                name="requirementIds"
                groups={requirementGroups.map((g) => ({ label: g.norm, options: g.options }))}
                selected={report?.requirements.map((r) => r.id) ?? []}
                height="10rem"
              />
            </Field>
          )}
        </>
      )}
      <div className="md:col-span-4">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </Form>
  );
}
