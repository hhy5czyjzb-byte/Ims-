import Link from "next/link";
import { Field } from "@/components/ui";
import { PERIOD_PARTS } from "@/lib/co2";

/** Keuze jaar / periode / type uitstoot (zoals de keuzevariabelen bovenaan de dashboardtabbladen). */
export function Co2Filters({
  action,
  year,
  part,
  type,
  unit,
  years,
  showPart = true,
  showType = true,
  showUnit = false,
}: {
  action: string;
  year: number;
  part?: string;
  type?: string;
  unit?: string;
  years: number[];
  showPart?: boolean;
  showType?: boolean;
  showUnit?: boolean;
}) {
  return (
    <form action={action} className="mb-6 flex flex-wrap items-end gap-2 print:hidden" role="search">
      <Field label="Jaar">
        <select name="jaar" defaultValue={year} className="input">
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </Field>
      {showPart && (
        <Field label="Periode">
          <select name="deel" defaultValue={part ?? "jaar"} className="input">
            {PERIOD_PARTS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      {showType && (
        <Field label="Type uitstoot">
          <select name="type" defaultValue={type} className="input">
            <option value="WTW">Well-to-wheel (WTW)</option>
            <option value="TTW">Tank-to-wheel (TTW)</option>
          </select>
        </Field>
      )}
      {showUnit && (
        <Field label="Eenheid energie">
          <select name="eenheid" defaultValue={unit ?? "GJ"} className="input">
            <option value="GJ">GJ</option>
            <option value="kWh">kWh</option>
          </select>
        </Field>
      )}
      <button className="btn-secondary">Tonen</button>
      <Link href={action} className="btn-link self-center">
        Standaard
      </Link>
    </form>
  );
}

/** Jaren met verbruik (van eerste tot huidig jaar). */
export function yearList(first: number | null, now = new Date()): number[] {
  const last = now.getUTCFullYear();
  const start = Math.min(first ?? last, last);
  return Array.from({ length: last - start + 1 }, (_, i) => last - i);
}
