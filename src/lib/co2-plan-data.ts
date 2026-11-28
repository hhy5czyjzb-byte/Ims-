import { prisma } from "@/lib/db";
import { PLAN_GROUPS, STREAM_GROUPS, streamGroupOf } from "@/lib/co2";
import { getMainTarget, latestDataYear, loadInventory } from "@/lib/co2-data";
import { planCalculation } from "@/lib/co2-plan";
import { getPvaSettings } from "@/lib/co2-pva";

/** Alles voor het plan van aanpak en de berekening van de doelstelling (basisjaar = hoofddoelstelling of pva). */
export async function loadPlanData() {
  const [target, pva] = await Promise.all([getMainTarget(), getPvaSettings()]);
  const baseYear = target?.baseYear ?? pva.target?.baseYear ?? (await latestDataYear());
  const targetYear = target?.targetYear ?? pva.target?.targetYear ?? baseYear + 3;
  const [inv, measures, scopeTargets] = await Promise.all([
    loadInventory(baseYear),
    prisma.action.findMany({
      where: { source: "CO2_REDUCTION" },
      orderBy: [{ number: "asc" }],
      include: { co2Measure: true, owner: { select: { name: true } } },
    }),
    prisma.reductionTarget.findMany({ where: { active: true, baseYear, targetYear, scope: { not: null }, disciplineId: null }, orderBy: { scope: "asc" } }),
  ]);

  // Uitstoot en energie per emissiestroom in het basisjaar, met de energiedragers erin.
  const groupMap = new Map<
    string,
    { group: string; kg: number; gj: number; carriers: { carrierId: string; name: string; kg: number; gj: number; unit: string; quantity: number }[] }
  >();
  for (const l of inv.lines) {
    const g = streamGroupOf({ name: l.name, reportGroup: l.group, defaultScope: l.scope });
    const cur = groupMap.get(g) ?? { group: g, kg: 0, gj: 0, carriers: [] };
    cur.kg += l.kg;
    cur.gj += l.gj ?? 0;
    cur.carriers.push({ carrierId: l.carrierId, name: l.name, kg: l.kg, gj: l.gj ?? 0, unit: l.unit, quantity: l.quantity });
    groupMap.set(g, cur);
  }
  const groupOf = (g: string | null | undefined) => (g && (PLAN_GROUPS as readonly string[]).includes(g) ? g : (g ?? "Overig"));
  const sorted = [...measures].sort((a, b) => (a.co2Measure?.sortOrder || 100_000) - (b.co2Measure?.sortOrder || 100_000) || a.number - b.number);
  const groups = STREAM_GROUPS.map((g) => groupMap.get(g) ?? { group: g, kg: 0, gj: 0, carriers: [] });
  const calc = planCalculation({
    groups: groups.map(({ group, kg, gj }) => ({ group, kg, gj })),
    measures: sorted.map((m) => ({
      id: m.id,
      group: groupOf(m.co2Measure?.streamGroup),
      reductionPct: m.co2Measure?.reductionPct === null || m.co2Measure?.reductionPct === undefined ? null : Number(m.co2Measure.reductionPct),
      energyReductionPct:
        m.co2Measure?.energyReductionPct === null || m.co2Measure?.energyReductionPct === undefined ? null : Number(m.co2Measure.energyReductionPct),
      cancelled: m.status === "CANCELLED",
    })),
    totalKg: inv.totalKg,
    totalGj: inv.energyTotalGJ,
  });
  return { target, pva, baseYear, targetYear, inv, measures: sorted, groupOf, groups, calc, scopeTargets };
}
