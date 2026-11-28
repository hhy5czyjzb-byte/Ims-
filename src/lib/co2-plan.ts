import { scopeOfGroup } from "@/lib/co2";

/**
 * Berekening van de CO2-reductiedoelstelling uit het plan van aanpak, zoals het tabblad
 * "PVA - berekening doelstelling" van het CO2-dashboard (pure functies, getest):
 *
 * - per maatregel: reductie op de emissiestroom (%) → reductie op het totaal = % × uitstoot stroom / totale uitstoot;
 *   zo ook voor energie (GJ);
 * - per emissiestroom en per scope opgeteld ("Reductie op totaal");
 * - reductiepotentieel per scope = gereduceerde uitstoot / uitstoot van die scope;
 * - tussendoelstellingen: lineair pad van het basisjaar naar het doeljaar (of de ingevulde waarden).
 * Uitstoot en energie komen uit de emissie-inventaris van het basisjaar.
 */

export type PlanGroupInput = { group: string; kg: number; gj: number };
export type PlanMeasureInput = { id: string; group: string; reductionPct: number | null; energyReductionPct: number | null; cancelled?: boolean };

export type PlanMeasureResult = {
  id: string;
  group: string;
  streamPct: number; // reductie op emissiestroom (%)
  totalPct: number; // reductie op totaal CO2 (%)
  energyPct: number; // reductie op energie van de stroom (%)
  energyTotalPct: number; // reductie op totaal GJ (%)
  kg: number; // verwachte reductie (kg CO2)
  gj: number;
};
export type PlanGroupResult = PlanGroupInput & {
  scope: 1 | 2 | 3 | null;
  streamPct: number;
  totalPct: number;
  energyPct: number;
  energyTotalPct: number;
  kgReduction: number;
  gjReduction: number;
};
export type PlanScopeResult = {
  scope: 1 | 2 | 3;
  kg: number;
  gj: number;
  totalPct: number;
  energyTotalPct: number;
  potentialPct: number;
  potentialGjPct: number;
};

export function planCalculation(input: { groups: PlanGroupInput[]; measures: PlanMeasureInput[]; totalKg: number; totalGj: number }) {
  const { totalKg, totalGj } = input;
  const byGroup = new Map(input.groups.map((g) => [g.group, g]));
  const measures: PlanMeasureResult[] = input.measures
    .filter((m) => !m.cancelled)
    .map((m) => {
      const g = byGroup.get(m.group);
      const sp = m.reductionPct ?? 0;
      const ep = m.energyReductionPct ?? 0;
      const kg = g ? (sp / 100) * g.kg : 0;
      const gj = g ? (ep / 100) * g.gj : 0;
      return {
        id: m.id,
        group: m.group,
        streamPct: sp,
        totalPct: totalKg ? (kg / totalKg) * 100 : 0,
        energyPct: ep,
        energyTotalPct: totalGj ? (gj / totalGj) * 100 : 0,
        kg,
        gj,
      };
    });
  const groups: PlanGroupResult[] = input.groups.map((g) => {
    const list = measures.filter((m) => m.group === g.group);
    const sum = (k: keyof PlanMeasureResult) => list.reduce((n, m) => n + (m[k] as number), 0);
    return {
      ...g,
      scope: scopeOfGroup(g.group),
      streamPct: sum("streamPct"),
      totalPct: sum("totalPct"),
      energyPct: sum("energyPct"),
      energyTotalPct: sum("energyTotalPct"),
      kgReduction: sum("kg"),
      gjReduction: sum("gj"),
    };
  });
  const scopes: PlanScopeResult[] = ([1, 2, 3] as const).map((scope) => {
    const gs = groups.filter((g) => g.scope === scope);
    const kg = gs.reduce((n, g) => n + g.kg, 0);
    const gj = gs.reduce((n, g) => n + g.gj, 0);
    const kgRed = gs.reduce((n, g) => n + g.kgReduction, 0);
    const gjRed = gs.reduce((n, g) => n + g.gjReduction, 0);
    return {
      scope,
      kg,
      gj,
      totalPct: gs.reduce((n, g) => n + g.totalPct, 0),
      energyTotalPct: gs.reduce((n, g) => n + g.energyTotalPct, 0),
      potentialPct: kg ? (kgRed / kg) * 100 : 0,
      potentialGjPct: gj ? (gjRed / gj) * 100 : 0,
    };
  });
  const totalPct = scopes.reduce((n, s) => n + s.totalPct, 0);
  const energyTotalPct = scopes.reduce((n, s) => n + s.energyTotalPct, 0);
  return { measures, groups, scopes, totalPct, energyTotalPct, kgReduction: measures.reduce((n, m) => n + m.kg, 0) };
}

/** Tussendoelstelling in jaar `year`: lineair van 0 % in het basisjaar naar `pct` in het doeljaar. */
export function milestonePct(pct: number, baseYear: number, targetYear: number, year: number): number {
  if (targetYear <= baseYear) return year >= targetYear ? pct : 0;
  return pct * Math.max(0, Math.min(1, (year - baseYear) / (targetYear - baseYear)));
}
