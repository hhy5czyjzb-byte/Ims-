import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { carrierGroup, computeFootprint, factorForType, periodRange, type EmissionType, type FactorRow, type PeriodPart } from "@/lib/co2";
import { getCo2Settings } from "@/lib/co2-settings";

export type FootprintFilter = { disciplineId?: string; locationId?: string; scope?: 1 | 2 | 3 };

/**
 * Alle emissiefactoren als getallen voor het gekozen type uitstoot (standaard de instelling, meestal WTW).
 * Factoren zonder waarde voor dat type tellen als 'ontbrekend'.
 */
export async function loadFactors(type?: EmissionType): Promise<FactorRow[]> {
  const t = type ?? (await getCo2Settings()).emissionType;
  const rows = await prisma.emissionFactor.findMany({ select: { carrierId: true, factor: true, ttw: true, wtt: true, biogenic: true, validFrom: true } });
  return rows.flatMap((f) => {
    const v = factorForType({ factor: Number(f.factor), ttw: f.ttw === null ? null : Number(f.ttw), wtt: f.wtt === null ? null : Number(f.wtt) }, t);
    return v === null ? [] : [{ carrierId: f.carrierId, factor: v, validFrom: f.validFrom }];
  });
}

/** Biogene factoren (apart gerapporteerd). */
async function loadBiogenicFactors(): Promise<FactorRow[]> {
  const rows = await prisma.emissionFactor.findMany({ where: { biogenic: { not: null } }, select: { carrierId: true, biogenic: true, validFrom: true } });
  return rows.map((f) => ({ carrierId: f.carrierId, factor: Number(f.biogenic), validFrom: f.validFrom }));
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
        carrier: { select: { id: true, name: true, unit: true, defaultScope: true, category: true, energyPerUnit: true, reportGroup: true } },
        organisation: { select: { id: true, name: true, boundaryPct: true } },
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
      // Aandeel binnen de organisatiegrens (bijv. 100 % Rouwmaat, 100 % Mombarg).
      quantity: Number(c.quantity) * (c.organisation ? Number(c.organisation.boundaryPct) / 100 : 1),
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

export type InventoryLine = {
  carrierId: string;
  name: string;
  unit: string;
  scope: 1 | 2 | 3;
  group: string;
  quantity: number;
  kg: number;
  factorKg: number | null; // gemiddelde factor (kg per eenheid) over de regels
  gj: number | null;
  wttKg: number;
  missing: number;
};

/**
 * CO2-emissie-inventaris zoals het tabblad in het CO2-dashboard: per emissiestroom aantal, eenheid, factor en uitstoot;
 * totalen per scope, groepen (tabel M1A), energie (GJ), location-based scope 2, WTT-deel en biogene emissies, en de intensiteit.
 */
export async function loadInventory(year: number, part: PeriodPart = "jaar", typeOverride?: EmissionType) {
  const settings = await getCo2Settings();
  const type = typeOverride ?? settings.emissionType;
  const [factors, wttFactors, bioFactors] = await Promise.all([loadFactors(type), loadFactors("WTT"), loadBiogenicFactors()]);
  const fp = await loadFootprint(year, part, {}, factors);
  const wtt = computeFootprint(
    fp.rows.map((r) => ({
      id: r.id,
      carrierId: r.carrierId,
      quantity: r.quantity,
      periodStart: r.c.periodStart,
      periodEnd: r.c.periodEnd,
      scope: r.scope,
      carrierScope: r.scope,
    })),
    wttFactors,
    { start: new Date(0), end: new Date(8.64e15) },
  );
  const bio = computeFootprint(
    fp.rows.map((r) => ({
      id: r.id,
      carrierId: r.carrierId,
      quantity: r.quantity,
      periodStart: r.c.periodStart,
      periodEnd: r.c.periodEnd,
      scope: r.scope,
      carrierScope: r.scope,
    })),
    bioFactors,
    { start: new Date(0), end: new Date(8.64e15) },
  );
  const wttById = new Map(wtt.rows.map((r) => [r.id, r.kg ?? 0]));

  const lines = new Map<string, InventoryLine>();
  for (const r of fp.rows) {
    const key = `${r.carrierId}|${r.scope}`;
    const cur =
      lines.get(key) ??
      ({
        carrierId: r.carrierId,
        name: r.c.carrier.name,
        unit: r.c.carrier.unit,
        scope: r.scope,
        group: carrierGroup(r.c.carrier),
        quantity: 0,
        kg: 0,
        factorKg: null,
        gj: r.c.carrier.energyPerUnit === null ? null : 0,
        wttKg: 0,
        missing: 0,
      } satisfies InventoryLine);
    cur.quantity += r.quantity;
    cur.kg += r.kg ?? 0;
    if (r.kg === null) cur.missing++;
    if (cur.gj !== null && r.c.carrier.energyPerUnit !== null) cur.gj += r.quantity * Number(r.c.carrier.energyPerUnit);
    cur.wttKg += wttById.get(r.id) ?? 0;
    lines.set(key, cur);
  }
  const list = [...lines.values()]
    .map((l) => ({ ...l, factorKg: l.quantity ? l.kg / l.quantity : null }))
    .sort((a, b) => a.scope - b.scope || a.name.localeCompare(b.name, "nl"));

  const groups = new Map<string, number>();
  for (const l of list) groups.set(l.group, (groups.get(l.group) ?? 0) + l.kg);
  const energyByScope = { 1: 0, 2: 0, 3: 0 } as Record<1 | 2 | 3, number>;
  for (const l of list) energyByScope[l.scope] += l.gj ?? 0;

  // Location-based scope 2: alle elektriciteit (kWh, incl. groen en teruglevering) × factor gridmix.
  let locationBased: { kwh: number; factorKg: number | null; kg: number | null; carrierName: string | null } | null = null;
  if (settings.locationBasedCarrierId) {
    const ref = await prisma.energyCarrier.findUnique({ where: { id: settings.locationBasedCarrierId }, select: { id: true, name: true } });
    if (ref) {
      const kwh = list
        .filter((l) => l.scope === 2 && l.group.startsWith("Elektriciteit") && l.unit.toLowerCase() === "kwh")
        .reduce((n, l) => n + l.quantity, 0);
      const range = periodRange(year, part);
      const f = factors.filter((x) => x.carrierId === ref.id && x.validFrom <= range.start).sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime())[0];
      locationBased = { kwh, factorKg: f?.factor ?? null, kg: f ? kwh * f.factor : null, carrierName: ref.name };
    }
  }

  const kpis = await prisma.co2Kpi.findMany({ where: { year } });
  const kpiSum = (kind: string) => {
    const r = kpis.filter((k) => k.kind === kind);
    return r.length ? r.reduce((n, k) => n + Number(k.value), 0) : null;
  };
  return {
    type,
    settings,
    year,
    part,
    range: fp.range,
    lines: list,
    byScope: fp.byScope,
    totalKg: fp.totalKg,
    missingFactor: fp.missingFactor,
    groups: [...groups.entries()].map(([group, kg]) => ({ group, kg })).sort((a, b) => b.kg - a.kg),
    energyByScope,
    energyTotalGJ: energyByScope[1] + energyByScope[2] + energyByScope[3],
    wttKg: wtt.totalKg,
    biogenicKg: bio.totalKg,
    locationBased,
    fte: kpiSum("FTE"),
    revenue: kpiSum("REVENUE"),
  };
}

/** Uitstoot en energie per emissiestroom per jaar (voortgang), voor een reeks jaren. */
export async function loadProgress(fromYear: number, toYear: number) {
  const out: Awaited<ReturnType<typeof loadInventory>>[] = [];
  for (let y = fromYear; y <= toYear; y++) out.push(await loadInventory(y));
  return out;
}

/** Keuzelijsten voor het plan van aanpak. */
export async function getMeasureLookups() {
  const [users, carriers, targets] = await Promise.all([
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.energyCarrier.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.reductionTarget.findMany({ where: { active: true }, orderBy: { targetYear: "asc" }, select: { id: true, title: true } }),
  ]);
  return {
    users: users.map((u) => ({ value: u.id, label: u.name })),
    carriers: carriers.map((c) => ({ value: c.id, label: c.name })),
    targets: targets.map((t) => ({ value: t.id, label: t.title })),
  };
}

/**
 * De hoofddoelstelling (hele organisatie): die waaraan de meeste maatregelen gekoppeld zijn, anders de laatst aangemaakte.
 */
export async function getMainTarget() {
  const targets = await prisma.reductionTarget.findMany({
    where: { active: true, scope: null, disciplineId: null },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { measures: true } } },
  });
  return [...targets].sort((a, b) => b._count.measures - a._count.measures)[0] ?? null;
}
