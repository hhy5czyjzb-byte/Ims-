import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { computeFootprint, periodRange, type FactorRow, type PeriodPart } from "@/lib/co2";

export type FootprintFilter = { disciplineId?: string; locationId?: string; scope?: 1 | 2 | 3 };

/** Alle emissiefactoren als getallen (voor de berekening). */
export async function loadFactors(): Promise<FactorRow[]> {
  const rows = await prisma.emissionFactor.findMany({ select: { carrierId: true, factor: true, validFrom: true } });
  return rows.map((f) => ({ carrierId: f.carrierId, factor: Number(f.factor), validFrom: f.validFrom }));
}

/** Footprint voor een jaar/halfjaar/kwartaal, met verbruiksregels die (deels) in de periode vallen. */
export async function loadFootprint(year: number, part: PeriodPart = "jaar", filter: FootprintFilter = {}, factors?: FactorRow[]) {
  const range = periodRange(year, part);
  const where: Prisma.EnergyConsumptionWhereInput = {
    periodStart: { lt: range.end },
    periodEnd: { gte: range.start },
    ...(filter.disciplineId ? { disciplineId: filter.disciplineId } : {}),
    ...(filter.locationId ? { locationId: filter.locationId } : {}),
  };
  const [consumptions, f] = await Promise.all([
    prisma.energyConsumption.findMany({
      where,
      include: {
        carrier: { select: { id: true, name: true, unit: true, defaultScope: true } },
        discipline: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        equipment: { select: { id: true, name: true, code: true } },
      },
    }),
    factors ? Promise.resolve(factors) : loadFactors(),
  ]);
  const inputs = consumptions
    .map((c) => ({
      id: c.id,
      carrierId: c.carrierId,
      quantity: Number(c.quantity),
      periodStart: c.periodStart,
      periodEnd: c.periodEnd,
      scope: c.scope,
      carrierScope: c.carrier.defaultScope,
    }))
    .filter((c) => !filter.scope || (c.scope ?? c.carrierScope) === filter.scope);
  const result = computeFootprint(inputs, f, range);
  const byId = new Map(consumptions.map((c) => [c.id, c]));
  const rows = result.rows.map((r) => ({ ...r, c: byId.get(r.id)! }));
  return { ...result, rows, range };
}

/** Uitstoot (kg) per jaar over een reeks jaren, voor doelstellingen en trends. */
export async function yearlyTotals(fromYear: number, toYear: number, filter: FootprintFilter = {}) {
  const factors = await loadFactors();
  const out: { year: number; kg: number; missingFactor: number }[] = [];
  for (let y = fromYear; y <= toYear; y++) {
    const fp = await loadFootprint(y, "jaar", filter, factors);
    out.push({ year: y, kg: fp.totalKg, missingFactor: fp.missingFactor });
  }
  return out;
}

/** Keuzelijsten voor het verbruiksformulier. */
export async function getCo2FormOptions() {
  const [carriers, equipment, disciplines, locations] = await Promise.all([
    prisma.energyCarrier.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, unit: true, defaultScope: true },
    }),
    prisma.equipment.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true, defaultCarrierId: true } }),
    prisma.discipline.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.location.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
  ]);
  return {
    carriers,
    equipment: equipment.map((e) => ({ id: e.id, label: e.code ? `${e.name} (${e.code})` : e.name, defaultCarrierId: e.defaultCarrierId })),
    disciplines: disciplines.map((d) => ({ value: d.id, label: d.name })),
    locations: locations.map((l) => ({ value: l.id, label: l.name })),
  };
}

type TargetLike = {
  scope: number | null;
  baseYear: number;
  targetYear: number;
  reductionPct: Prisma.Decimal | number;
  baselineKg: Prisma.Decimal | number | null;
  disciplineId: string | null;
};

/**
 * Voortgang van een doelstelling per jaar (basisjaar t/m min(doeljaar, huidig jaar)).
 * `latestFull` = het laatste volledige kalenderjaar; het lopende jaar is nog niet compleet.
 */
export async function targetStatus(t: TargetLike, factors?: FactorRow[], now = new Date()) {
  const { targetProgress } = await import("@/lib/co2");
  const f = factors ?? (await loadFactors());
  const filter: FootprintFilter = { scope: (t.scope as 1 | 2 | 3 | null) ?? undefined, disciplineId: t.disciplineId ?? undefined };
  const currentYear = now.getUTCFullYear();
  const lastYear = Math.min(t.targetYear, currentYear);
  const base = await loadFootprint(t.baseYear, "jaar", filter, f);
  const baseKg = t.baselineKg !== null && t.baselineKg !== undefined ? Number(t.baselineKg) : base.totalKg;
  const years = [];
  for (let y = t.baseYear; y <= lastYear; y++) {
    const fp = y === t.baseYear ? base : await loadFootprint(y, "jaar", filter, f);
    const p = targetProgress({ baseKg, currentKg: fp.totalKg, reductionPct: Number(t.reductionPct), baseYear: t.baseYear, targetYear: t.targetYear, year: y });
    years.push({ year: y, kg: fp.totalKg, missingFactor: fp.missingFactor, complete: y < currentYear, ...p });
  }
  const latestFull = [...years].reverse().find((y) => y.complete && y.year > t.baseYear) ?? null;
  return { baseKg, baseFromData: t.baselineKg === null || t.baselineKg === undefined, years, latestFull };
}
