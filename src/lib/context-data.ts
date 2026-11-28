import { prisma } from "@/lib/db";

/** Actuele versie: de vastgestelde, anders de laatst ingelezen; of een opgegeven versie. */
export async function getAnalysis(versionId?: string) {
  const include = { approvedBy: { select: { name: true } }, uploadedBy: { select: { name: true } } } as const;
  if (versionId) return prisma.contextAnalysis.findUnique({ where: { id: versionId }, include });
  return (
    (await prisma.contextAnalysis.findFirst({ where: { status: "APPROVED" }, orderBy: { approvedAt: "desc" }, include })) ??
    (await prisma.contextAnalysis.findFirst({ orderBy: { createdAt: "desc" }, include }))
  );
}

export type FactorLinks = { risks: number; opportunities: number; strategic: number; aspects: number; significantAspects: number };

/** Aantal gekoppelde risico's/kansen (niet afgesloten) en milieuaspecten (actief, in werking) per contextfactor (op naam). */
export async function getFactorLinks(): Promise<Map<string, FactorLinks>> {
  const [risks, aspects] = await Promise.all([
    prisma.risk.groupBy({
      by: ["contextFactor", "type", "strategic"],
      where: { contextFactor: { not: null }, status: { not: "CLOSED" } },
      _count: { _all: true },
    }),
    prisma.environmentalAspect.groupBy({
      by: ["contextFactor", "significant"],
      where: { contextFactor: { not: null }, active: true, inOperation: true },
      _count: { _all: true },
    }),
  ]);
  const map = new Map<string, FactorLinks>();
  const get = (k: string) => {
    if (!map.has(k)) map.set(k, { risks: 0, opportunities: 0, strategic: 0, aspects: 0, significantAspects: 0 });
    return map.get(k)!;
  };
  for (const r of risks) {
    const l = get(r.contextFactor!);
    if (r.type === "OPPORTUNITY") l.opportunities += r._count._all;
    else l.risks += r._count._all;
    if (r.strategic) l.strategic += r._count._all;
  }
  for (const a of aspects) {
    const l = get(a.contextFactor!);
    l.aspects += a._count._all;
    if (a.significant) l.significantAspects += a._count._all;
  }
  return map;
}
