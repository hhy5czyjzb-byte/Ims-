import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { getFactorLinks } from "@/lib/context-data";
import { CONTEXT_FACTOR_KIND_LABEL } from "@/lib/labels";
import { Badge, Disclosure, EmptyState, PageHeader } from "@/components/ui";
import { ContextNav } from "@/components/context-nav";
import { ContextFactorForm } from "@/components/context-factor-form";
import { createFactor } from "../actions";

export const metadata = { title: "Contextfactoren" };

export default async function ContextFactorsPage() {
  const user = await requireUser();
  const canEdit = can(user.role, "context.edit");
  const [factors, links, riskNames, aspectNames] = await Promise.all([
    prisma.contextFactor.findMany({ orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }] }),
    getFactorLinks(),
    prisma.risk.findMany({ where: { contextFactor: { not: null } }, distinct: ["contextFactor"], select: { contextFactor: true } }),
    prisma.environmentalAspect.findMany({ where: { contextFactor: { not: null } }, distinct: ["contextFactor"], select: { contextFactor: true } }),
  ]);
  const known = new Set(factors.map((f) => f.name));
  const unknown = [...new Set([...riskNames, ...aspectNames].map((r) => r.contextFactor!))].filter((n) => !known.has(n)).sort();
  const groups = (["EXTERNAL", "INTERNAL"] as const).map((k) => ({ kind: k, items: factors.filter((f) => f.kind === k) }));

  return (
    <>
      <PageHeader
        title="Context en stakeholders"
        description="Externe en interne contextfactoren (ISO 9001/14001 §4.1). Risico's, kansen en milieuaspecten zijn op de naam van de factor gekoppeld (kolom Contextfactor in de registers)."
      />
      <ContextNav />

      {unknown.length > 0 && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          In de registers komen contextfactoren voor die hier niet staan: {unknown.join(", ")}. Voeg ze toe of pas de schrijfwijze in het register aan.
        </p>
      )}

      {factors.length === 0 ? (
        <EmptyState>Nog geen contextfactoren. Ze worden overgenomen bij het inlezen van de analyse (tabel &ldquo;Overzicht contextfactoren&rdquo;).</EmptyState>
      ) : (
        groups.map(
          (g) =>
            g.items.length > 0 && (
              <section key={g.kind} className="card mb-6 overflow-x-auto p-0">
                <h2 className="px-5 pt-4 pb-2">{CONTEXT_FACTOR_KIND_LABEL[g.kind]}e context</h2>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Contextfactor</th>
                      <th>Belang</th>
                      <th>Karakter</th>
                      <th>Wat we ermee willen</th>
                      <th className="text-right">Risico&apos;s</th>
                      <th className="text-right">Kansen</th>
                      <th className="text-right">Milieuaspecten</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((f) => {
                      const l = links.get(f.name) ?? { risks: 0, opportunities: 0, strategic: 0, aspects: 0, significantAspects: 0 };
                      return (
                        <tr key={f.id} className={f.active ? "" : "opacity-50"}>
                          <td>
                            <Link href={`/context/factoren/${f.id}`} className="font-medium">
                              {f.name}
                            </Link>
                            {f.sectionNumber && <div className="text-xs text-neutral-500">§ {f.sectionNumber}</div>}
                          </td>
                          <td>
                            {f.importance && (
                              <Badge className={/hoog/i.test(f.importance) ? "bg-red-50 text-brand-red-dark" : "bg-neutral-100 text-neutral-700"}>
                                {f.importance}
                              </Badge>
                            )}
                          </td>
                          <td className="text-xs">{f.character ?? "—"}</td>
                          <td className="text-xs">{f.ambition ?? "—"}</td>
                          <td className="text-right tabular-nums">
                            <Link href={`/risicos?context=${encodeURIComponent(f.name)}&soort=RISK`}>{l.risks}</Link>
                            {l.strategic > 0 && <div className="text-xs text-neutral-500">{l.strategic} ★</div>}
                          </td>
                          <td className="text-right tabular-nums">
                            <Link href={`/risicos?context=${encodeURIComponent(f.name)}&soort=OPPORTUNITY`}>{l.opportunities}</Link>
                          </td>
                          <td className="text-right tabular-nums">
                            <Link href={`/milieuaspecten?context=${encodeURIComponent(f.name)}&werking=ja`}>{l.aspects}</Link>
                            {l.significantAspects > 0 && <div className="text-xs text-neutral-500">{l.significantAspects} significant</div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            ),
        )
      )}

      {canEdit && (
        <Disclosure summary="Contextfactor toevoegen">
          <ContextFactorForm formAction={createFactor} submitLabel="Toevoegen" reset />
        </Disclosure>
      )}
    </>
  );
}
