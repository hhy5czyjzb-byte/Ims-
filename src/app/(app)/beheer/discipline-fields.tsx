import type { Discipline } from "@prisma/client";
import { Field } from "@/components/ui";

export function DisciplineFields({ d }: { d?: Discipline }) {
  return (
    <div className="grid gap-3 md:grid-cols-6">
      <Field label="Naam" className="md:col-span-4">
        <input name="name" required defaultValue={d?.name} className="input" />
      </Field>
      <Field label="Volgorde" className="md:col-span-2">
        <input name="sortOrder" type="number" min={0} defaultValue={d?.sortOrder ?? 0} className="input" />
      </Field>
      <Field label="Manager / directeur" className="md:col-span-6">
        <input name="managerText" defaultValue={d?.managerText ?? ""} className="input" />
      </Field>
      <Field label="Omschrijving" className="md:col-span-6">
        <textarea name="description" rows={2} defaultValue={d?.description ?? ""} className="input" />
      </Field>
      <Field
        label="Andere namen (voor import)"
        hint="Gescheiden door komma's. Zo herkent de import ook bijv. 'Afval & Recycling' als dit bedrijfsonderdeel. Bij hernoemen blijft de oude naam hier automatisch staan."
        className="md:col-span-6"
      >
        <input name="aliases" defaultValue={d?.aliases.join(", ") ?? ""} className="input" />
      </Field>
    </div>
  );
}
