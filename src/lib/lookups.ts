import { prisma } from "@/lib/db";

/** Keuzelijsten voor formulieren. */
export async function getLookups() {
  const [users, disciplines, locations, jobFunctions] = await Promise.all([
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.discipline.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.location.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.jobFunction.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const opt = (rows: { id: string; name: string }[]) => rows.map((r) => ({ value: r.id, label: r.name }));
  return {
    users: opt(users),
    disciplines: opt(disciplines),
    locations: opt(locations),
    jobFunctions: opt(jobFunctions),
  };
}

/** Alle normeisen als keuzelijst, gegroepeerd per norm (voor koppelen). */
export async function getRequirementOptions() {
  const norms = await prisma.norm.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    select: { id: true, code: true, requirements: { select: { id: true, clause: true, title: true, sortOrder: true } } },
  });
  return norms.map((n) => ({
    norm: n.code,
    options: [...n.requirements].sort(compareRequirementFlat).map((r) => ({ value: r.id, label: `${n.code} ${r.clause} — ${r.title}` })),
  }));
}

/** Natuurlijke sortering van paragraafnummers: 4.9 vóór 4.10. */
export function compareClause(a: string, b: string): number {
  return a.localeCompare(b, "nl", { numeric: true, sensitivity: "base" });
}

/** Sortering van broers/zussen in de boom (zelfde niveau): handmatige volgorde, dan paragraaf. */
export function compareRequirement(a: { sortOrder: number; clause: string }, b: { sortOrder: number; clause: string }) {
  return a.sortOrder - b.sortOrder || compareClause(a.clause, b.clause);
}

/**
 * Sortering van een platte lijst eisen over alle niveaus heen (keuzelijsten, checklists):
 * op paragraafnummer. `sortOrder` geldt alleen binnen één niveau en is hier niet bruikbaar.
 */
export function compareRequirementFlat(a: { clause: string }, b: { clause: string }) {
  return compareClause(a.clause, b.clause);
}
