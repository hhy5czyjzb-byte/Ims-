import { prisma } from "@/lib/db";
import { getLookups, getRequirementOptions } from "@/lib/lookups";

/** Keuzelijsten voor het formulier. */
export async function getObjectiveLookups() {
  const [base, requirementGroups, norms, targets] = await Promise.all([
    getLookups(),
    getRequirementOptions(),
    prisma.norm.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }], select: { id: true, code: true, name: true } }),
    prisma.reductionTarget.findMany({ where: { active: true }, orderBy: { targetYear: "asc" }, select: { id: true, title: true } }),
  ]);
  return {
    users: base.users,
    disciplines: base.disciplines,
    requirementGroups,
    norms: norms.map((n) => ({ value: n.id, label: `${n.code} — ${n.name}` })),
    reductionTargets: targets.map((t) => ({ value: t.id, label: t.title })),
  };
}
