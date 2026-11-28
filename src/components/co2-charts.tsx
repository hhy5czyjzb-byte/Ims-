import { CATEGORICAL, Donut, GroupedColumns, sequentialRamp } from "@/components/charts";
import { GROUP_ORDER, groupSlot } from "@/lib/co2";
import { categoriesOf, fleetSeries, type ManualCount, type RegisterVehicle } from "@/lib/fleet";

/**
 * Grafieken van de CO2-module (zoals in het CO2-jaarverslag), server-side.
 * Groepen hebben een vaste kleur (GROUP_ORDER), zodat dezelfde groep overal dezelfde kleur heeft.
 */

/** "Brandstofverbruik wagenpark" → "Brandstof wagenpark", "Aardgasverbruik" → "Aardgas" (korter in de legenda). */
export function shortGroup(name: string): string {
  const short = name.replace(/^(Aardgas|Brandstof|Elektriciteit)s?verbruik\b/i, "$1").trim();
  return short || name;
}

/** Ringgrafiek per groep (bijv. CO2-footprint of energiebalans per groep zoals tabel M1A). */
export function GroupDonut({
  items,
  unit,
  centerLabel,
  decimals = 0,
}: {
  items: { group: string; value: number }[];
  unit: string;
  centerLabel?: string;
  decimals?: number;
}) {
  const map = new Map<string, number>();
  for (const i of items) map.set(i.group, (map.get(i.group) ?? 0) + i.value);
  const extra = [...map.keys()].filter((g) => !(GROUP_ORDER as readonly string[]).includes(g));
  const ordered = [...(GROUP_ORDER as readonly string[]).filter((g) => map.has(g)), ...extra];
  return (
    <Donut
      parts={ordered.map((g) => ({ label: shortGroup(g), title: g, value: map.get(g) ?? 0, color: CATEGORICAL[groupSlot(g, extra)] }))}
      unit={unit}
      centerLabel={centerLabel}
      decimals={decimals}
    />
  );
}

/** "Brandstofverbruik wagenpark - diesel" → "Wagenpark - diesel" (korter label onder de grafiek). */
function shortCarrier(name: string): string {
  const s = name.replace(/^brandstofverbruik\s+(-\s*)?/i, "");
  return s ? s[0].toUpperCase() + s.slice(1) : name;
}

/** Brandstofverbruik per jaar (liters) per energiedrager, jaren als reeksen (licht → donker). */
export function FuelPerYear({ perYear, carriers, max = 5 }: { perYear: { year: number; byCarrier: Map<string, number> }[]; carriers: string[]; max?: number }) {
  const years = perYear.filter((p) => [...p.byCarrier.values()].some((v) => v > 0));
  const cs = carriers.slice(0, max);
  if (!years.length || !cs.length) return <p className="text-sm text-neutral-500">Nog geen brandstofverbruik in liters.</p>;
  return (
    <GroupedColumns
      groups={cs.map(shortCarrier)}
      series={years.map((y) => ({ name: String(y.year), values: cs.map((c) => Math.round(y.byCarrier.get(c) ?? 0)) }))}
      colors={sequentialRamp(years.length)}
      height={240}
      unit=" liter"
    />
  );
}

/** Figuur V1 (milieuclassificatie vrachtwagens) of V3 (brandstoftypes wagenpark) uit het wagenpark. */
export function FleetFigure({
  kind,
  manual,
  vehicles,
  vehicleType,
  years = 6,
}: {
  kind: "FUEL" | "EURO";
  manual: ManualCount[];
  vehicles: RegisterVehicle[];
  vehicleType?: string;
  years?: number;
}) {
  const s = fleetSeries(kind, manual, vehicles, vehicleType);
  const ys = s.years.slice(-years);
  if (!ys.length || ys.every((y) => s.total(y) === 0)) return <p className="text-sm text-neutral-500">Nog geen wagenparkgegevens (CO2 → Wagenpark).</p>;
  const cats = kind === "EURO" ? categoriesOf("EURO") : s.categories;
  return (
    <GroupedColumns
      groups={[...cats.map((c) => c.label), "Totaal"]}
      series={ys.map((y) => ({ name: String(y), values: [...cats.map((c) => s.value(c.key, y)), s.total(y)] }))}
      colors={sequentialRamp(ys.length)}
      height={220}
      unit=" voertuigen"
    />
  );
}
