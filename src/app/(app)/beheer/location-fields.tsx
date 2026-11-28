import type { Location } from "@prisma/client";
import { Field } from "@/components/ui";

export const LOCATION_KINDS = [
  "Hoofdkantoor",
  "Vestiging",
  "Betoncentrale",
  "Prefabfabriek",
  "Werkplaats",
  "Depot / opslag",
  "Recyclinglocatie",
  "Kantoor",
  "Overig",
];

/** Velden van een vestiging (toevoegen en wijzigen). */
export function LocationFields({ l }: { l?: Location }) {
  return (
    <div className="grid gap-3 md:grid-cols-6">
      <Field label="Naam" className="md:col-span-3">
        <input name="name" required defaultValue={l?.name} className="input" />
      </Field>
      <Field label="Soort" className="md:col-span-2">
        <input name="kind" list="location-kinds" defaultValue={l?.kind ?? ""} className="input" placeholder="Kies of typ" />
        <datalist id="location-kinds">
          {LOCATION_KINDS.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
      </Field>
      <Field label="Volgorde" className="md:col-span-1">
        <input name="sortOrder" type="number" min={0} defaultValue={l?.sortOrder ?? 0} className="input" />
      </Field>
      <Field label="Adres (straat en nummer)" className="md:col-span-3">
        <input name="address" defaultValue={l?.address ?? ""} className="input" />
      </Field>
      <Field label="Postcode" className="md:col-span-1">
        <input name="postalCode" defaultValue={l?.postalCode ?? ""} className="input" />
      </Field>
      <Field label="Plaats" className="md:col-span-2">
        <input name="city" defaultValue={l?.city ?? ""} className="input" />
      </Field>
      <Field label="Vestigingsmanager / contactpersoon" className="md:col-span-3">
        <input name="managerText" defaultValue={l?.managerText ?? ""} className="input" />
      </Field>
      <Field label="Energiebesparingsplicht" className="md:col-span-3">
        <select name="energySavingObligation" defaultValue={l?.energySavingObligation ?? ""} className="input">
          <option value="">Niet ingevuld</option>
          <option value="Ja">Ja</option>
          <option value="Nee">Nee</option>
          <option value="Nog bepalen">Nog bepalen</option>
          {l?.energySavingObligation && !["Ja", "Nee", "Nog bepalen"].includes(l.energySavingObligation) && (
            <option value={l.energySavingObligation}>{l.energySavingObligation}</option>
          )}
        </select>
      </Field>
      <Field label="Activiteiten op de locatie" className="md:col-span-6">
        <textarea name="activities" rows={2} defaultValue={l?.activities ?? ""} className="input" />
      </Field>
      <Field label="Vergunningen en meldingen" hint="Bijv. omgevingsvergunning (nummer, datum), meldingen Activiteitenbesluit/Bal." className="md:col-span-6">
        <textarea name="permitInfo" rows={2} defaultValue={l?.permitInfo ?? ""} className="input" />
      </Field>
      <Field label="Opmerkingen" className="md:col-span-6">
        <textarea name="notes" rows={2} defaultValue={l?.notes ?? ""} className="input" />
      </Field>
    </div>
  );
}
