import { prisma } from "@/lib/db";
import { getRequirementOptions } from "@/lib/lookups";
import { riskDisplayCode } from "@/lib/risk";
import { legalDisplayCode } from "@/lib/compliance";

/** Keuzelijsten om een wettelijke eis te koppelen aan processen, documenten, risico's en normeisen. */
export async function getLegalLinkOptions() {
  const [processes, documents, risks, requirementGroups, norms] = await Promise.all([
    prisma.process.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.document.findMany({ orderBy: [{ documentNumber: "asc" }, { title: "asc" }], select: { id: true, title: true, documentNumber: true } }),
    prisma.risk.findMany({
      where: { status: { not: "CLOSED" } },
      orderBy: { number: "asc" },
      select: { id: true, number: true, type: true, title: true, externalRef: true },
    }),
    getRequirementOptions(),
    prisma.norm.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }], select: { id: true, code: true } }),
  ]);
  return {
    norms: norms.map((n) => ({ value: n.id, label: n.code })),
    processes: processes.map((p) => ({ value: p.id, label: p.name })),
    documents: documents.map((d) => ({ value: d.id, label: d.documentNumber ? `${d.documentNumber} — ${d.title}` : d.title })),
    risks: risks.map((r) => ({ value: r.id, label: `${riskDisplayCode(r)} ${r.title}` })),
    requirementGroups,
  };
}

/** Keuzelijsten om een milieuaspect te koppelen (processen, risico's, wettelijke eisen, normeisen). */
export async function getAspectLinkOptions() {
  const [base, legal] = await Promise.all([
    getLegalLinkOptions(),
    prisma.legalRequirement.findMany({
      where: { active: true },
      orderBy: [{ externalRef: "asc" }, { title: "asc" }, { article: "asc" }],
      select: { id: true, number: true, externalRef: true, title: true, article: true },
    }),
  ]);
  return {
    processes: base.processes,
    risks: base.risks,
    requirementGroups: base.requirementGroups,
    legal: legal.map((l) => ({ value: l.id, label: `${legalDisplayCode(l)} ${l.title}${l.article ? ` — ${l.article}` : ""}` })),
  };
}
