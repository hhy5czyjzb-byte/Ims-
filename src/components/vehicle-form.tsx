import type { Equipment } from "@prisma/client";
import type { ActionResult } from "@/lib/action-result";
import { Field, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { EURO_CLASSES, FUEL_TYPES, VEHICLE_TYPES, euroLabel } from "@/lib/fleet";
import { toDateInput } from "@/lib/format";

type Opt = { value: string; label: string };

/** Voertuig of materieel toevoegen / wijzigen (wagenpark: soort, brandstof, Euroklasse, in/uit dienst). */
export function VehicleForm({
  vehicle,
  formAction,
  lookups,
  submitLabel,
}: {
  vehicle?: Equipment;
  formAction: (fd: FormData) => Promise<ActionResult>;
  lookups: { carriers: Opt[]; disciplines: Opt[]; locations: Opt[] };
  submitLabel: string;
}) {
  const v = vehicle;
  return (
    <Form action={formAction} resetOnSuccess={!v} className="grid gap-3 md:grid-cols-4">
      <Field label="Kenteken / machinenummer">
        <input name="code" maxLength={50} defaultValue={v?.code ?? ""} className="input" placeholder="bijv. 12-BXR-3" />
      </Field>
      <Field label="Naam / omschrijving" className="md:col-span-2">
        <input name="name" required maxLength={200} defaultValue={v?.name} className="input" placeholder="bijv. DAF XF 480 trekker" />
      </Field>
      <Field label="Type (vrije tekst)">
        <input name="type" maxLength={100} defaultValue={v?.type ?? ""} className="input" placeholder="trekker, shovel, …" />
      </Field>
      <Field label="Soort voertuig (wagenpark)">
        <Select
          name="vehicleType"
          options={VEHICLE_TYPES.map((t) => ({ value: t.key, label: t.label }))}
          defaultValue={v?.vehicleType}
          placeholder="— telt niet mee —"
        />
      </Field>
      <Field label="Brandstof">
        <Select name="fuelType" options={FUEL_TYPES.map((t) => ({ value: t.key, label: t.label }))} defaultValue={v?.fuelType} placeholder="—" />
      </Field>
      <Field label="Euroklasse (milieuclassificatie)">
        <Select name="euroClass" options={EURO_CLASSES.map((t) => ({ value: t.key, label: euroLabel(t.key) }))} defaultValue={v?.euroClass} placeholder="—" />
      </Field>
      <Field label="Bouwjaar">
        <input name="buildYear" type="number" min={1950} max={2100} defaultValue={v?.buildYear ?? ""} className="input" />
      </Field>
      <Field label="Merk">
        <input name="brand" maxLength={100} defaultValue={v?.brand ?? ""} className="input" />
      </Field>
      <Field label="Model">
        <input name="model" maxLength={200} defaultValue={v?.model ?? ""} className="input" />
      </Field>
      <Field label="In dienst vanaf">
        <input name="inServiceFrom" type="date" defaultValue={toDateInput(v?.inServiceFrom)} className="input" />
      </Field>
      <Field label="Uit dienst per">
        <input name="inServiceUntil" type="date" defaultValue={toDateInput(v?.inServiceUntil)} className="input" />
      </Field>
      <Field label="Standaard energiedrager">
        <Select name="defaultCarrierId" options={lookups.carriers} defaultValue={v?.defaultCarrierId} placeholder="—" />
      </Field>
      <Field label="Bedrijfsonderdeel">
        <Select name="disciplineId" options={lookups.disciplines} defaultValue={v?.disciplineId} placeholder="Bedrijfsbreed" />
      </Field>
      <Field label="Vestiging">
        <Select name="locationId" options={lookups.locations} defaultValue={v?.locationId} placeholder="—" />
      </Field>
      <Field label="Opmerkingen">
        <input name="notes" maxLength={1000} defaultValue={v?.notes ?? ""} className="input" />
      </Field>
      {v && (
        <label className="flex items-center gap-2 text-sm md:col-span-4">
          <input type="checkbox" name="active" defaultChecked={v.active} /> In gebruik
        </label>
      )}
      <div className="md:col-span-4">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </Form>
  );
}
