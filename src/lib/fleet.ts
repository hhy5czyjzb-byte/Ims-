/** Wagenpark: soorten voertuigen en brandstoftypes (volgorde = volgorde in de grafiek, zoals figuur V3). */
export const VEHICLE_TYPES = [
  { key: "TRUCK", label: "Vrachtwagens" },
  { key: "VAN", label: "Bestelwagens / busjes" },
  { key: "CAR", label: "Personenauto's" },
  { key: "MACHINE", label: "Materieel (shovels, kranen, …)" },
  { key: "OTHER", label: "Overig" },
] as const;
export const FUEL_TYPES = [
  { key: "ELECTRIC", label: "Elektriciteit", zeroEmission: true },
  { key: "HYDROGEN", label: "Waterstof", zeroEmission: true },
  { key: "HYBRID", label: "Hybride", zeroEmission: false },
  { key: "HVO", label: "HVO", zeroEmission: false },
  { key: "GAS", label: "LNG / CNG / LPG", zeroEmission: false },
  { key: "PETROL", label: "Benzine", zeroEmission: false },
  { key: "DIESEL", label: "Diesel", zeroEmission: false },
  { key: "OTHER", label: "Overig", zeroEmission: false },
] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number]["key"];
export type FuelType = (typeof FUEL_TYPES)[number]["key"];
export const vehicleLabel = (k: string) => VEHICLE_TYPES.find((v) => v.key === k)?.label ?? k;
export const fuelLabel = (k: string) => FUEL_TYPES.find((f) => f.key === k)?.label ?? k;

type Row = { year: number; vehicleType: string; fuelType: string; count: number };

/** Aantallen per brandstoftype per jaar (optioneel één soort voertuig), plus totaal en aandeel zero-emissie. */
export function fleetMatrix(rows: Row[], vehicleType?: string) {
  const list = vehicleType ? rows.filter((r) => r.vehicleType === vehicleType) : rows;
  const years = [...new Set(list.map((r) => r.year))].sort((a, b) => a - b);
  const fuels = FUEL_TYPES.filter((f) => list.some((r) => r.fuelType === f.key && r.count > 0));
  const value = (fuel: string, year: number) => list.filter((r) => r.fuelType === fuel && r.year === year).reduce((n, r) => n + r.count, 0);
  const total = (year: number) => list.filter((r) => r.year === year).reduce((n, r) => n + r.count, 0);
  const zero = (year: number) =>
    list.filter((r) => r.year === year && FUEL_TYPES.find((f) => f.key === r.fuelType)?.zeroEmission).reduce((n, r) => n + r.count, 0);
  return {
    years,
    fuels,
    value,
    total,
    zeroPct: (year: number) => (total(year) ? (zero(year) / total(year)) * 100 : 0),
  };
}
