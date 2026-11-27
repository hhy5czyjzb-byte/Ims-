import { prisma } from "@/lib/db";

/**
 * Dekking per norm: een eis telt als 'afgedekt' wanneer er minstens één
 * bewijsstuk aan gekoppeld is (document, proces, processtap, risico, wettelijke eis of milieuaspect).
 * Basis voor de latere normmatrix en 'audit-ready'-score.
 */
export function isCovered(c: {
  documents: number;
  processes: number;
  processSteps: number;
  risks: number;
  legalRequirements?: number;
  environmentalAspects?: number;
}) {
  return c.documents + c.processes + c.processSteps + c.risks + (c.legalRequirements ?? 0) + (c.environmentalAspects ?? 0) > 0;
}

export async function getNormCoverage() {
  const norms = await prisma.norm.findMany({
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    include: {
      requirements: {
        select: {
          id: true,
          _count: {
            select: { documents: true, processes: true, processSteps: true, risks: true, legalRequirements: true, environmentalAspects: true, children: true },
          },
        },
      },
    },
  });
  return norms.map((n) => {
    // Hoofdstukken met onderliggende eisen tellen niet mee; alleen de 'bladeren'.
    const leaves = n.requirements.filter((r) => r._count.children === 0);
    const covered = leaves.filter((r) => isCovered(r._count)).length;
    return {
      id: n.id,
      code: n.code,
      name: n.name,
      version: n.version,
      category: n.category,
      active: n.active,
      requirementCount: n.requirements.length,
      leafCount: leaves.length,
      covered,
      coveragePct: leaves.length ? (covered / leaves.length) * 100 : 0,
    };
  });
}
