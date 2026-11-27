import { prisma } from "@/lib/db";
import { getRequirementOptions } from "@/lib/lookups";
import { riskCode } from "@/lib/risk";

/** Keuzelijsten om een wettelijke eis te koppelen aan processen, documenten, risico's en normeisen. */
export async function getLegalLinkOptions() {
  const [processes, documents, risks, requirementGroups] = await Promise.all([
    prisma.process.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.document.findMany({ orderBy: [{ documentNumber: "asc" }, { title: "asc" }], select: { id: true, title: true, documentNumber: true } }),
    prisma.risk.findMany({ where: { status: { not: "CLOSED" } }, orderBy: { number: "asc" }, select: { id: true, number: true, type: true, title: true } }),
    getRequirementOptions(),
  ]);
  return {
    processes: processes.map((p) => ({ value: p.id, label: p.name })),
    documents: documents.map((d) => ({ value: d.id, label: d.documentNumber ? `${d.documentNumber} — ${d.title}` : d.title })),
    risks: risks.map((r) => ({ value: r.id, label: `${riskCode(r.number, r.type)} ${r.title}` })),
    requirementGroups,
  };
}
