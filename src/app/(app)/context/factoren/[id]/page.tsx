import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { can } from "@/lib/rbac";
import { getAnalysis } from "@/lib/context-data";
import { sanitizeContextHtml } from "@/lib/context-import";
import { riskDisplayCode, riskLevel, RISK_LEVEL_LABEL, riskPriority } from "@/lib/risk";
import { aspectDisplayCode } from "@/lib/aspects";
import { ASPECT_PRIORITY_CLASS, ASPECT_PRIORITY_SHORT, CONTEXT_FACTOR_KIND_LABEL } from "@/lib/labels";
import { Badge, Disclosure, PageHeader } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { ContextNav } from "@/components/context-nav";
import { ContextFactorForm } from "@/components/context-factor-form";
import { deleteFactor, updateFactor } from "../../actions";

export default async function ContextFactorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const f = await prisma.contextFactor.findUnique({ where: { id } });
  if (!f) notFound();
  await logAudit({ user, action: "VIEW", entityType: "ContextFactor", entityId: id });
  const canEdit = can(user.role, "context.edit");
  const analysis = await getAnalysis();
  const [risks, aspects, section] = await Promise.all([
    prisma.risk.findMany({
      where: { contextFactor: f.name, status: { not: "CLOSED" } },
      orderBy: [{ type: "asc" }, { strategic: "desc" }, { externalRef: "asc" }],
      select: {
        id: true,
        number: true,
        externalRef: true,
        type: true,
        title: true,
        strategic: true,
        likelihoodBefore: true,
        impactBefore: true,
        ownerText: true,
      },
    }),
    prisma.environmentalAspect.findMany({
      where: { contextFactor: f.name, active: true, inOperation: true, significant: true },
      orderBy: [{ priority: "asc" }, { externalRef: "asc" }],
      select: { id: true, number: true, externalRef: true, aspect: true, businessUnit: true, locationText: true, priority: true, opportunity: true },
    }),
    analysis && f.sectionNumber ? prisma.contextSection.findFirst({ where: { analysisId: analysis.id, number: f.sectionNumber } }) : Promise.resolve(null),
  ]);
  const aspectTotal = await prisma.environmentalAspect.count({ where: { contextFactor: f.name, active: true, inOperation: true } });

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/context", label: "Context en stakeholders" },
          { href: "/context/factoren", label: "Contextfactoren" },
        ]}
        title={f.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge className="bg-neutral-100 text-neutral-700">{CONTEXT_FACTOR_KIND_LABEL[f.kind]}</Badge>
            {f.importance && <Badge className="bg-red-50 text-brand-red-dark">Belang {f.importance.toLowerCase()}</Badge>}
            {f.character && <Badge className="bg-neutral-100 text-neutral-700">{f.character}</Badge>}
            {!f.active && <Badge className="bg-neutral-200 text-neutral-600">Niet actief</Badge>}
          </span>
        }
      />
      <ContextNav />

      {f.ambition && (
        <section className="card mb-4 text-sm">
          <div className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Wat we ermee willen</div>
          <p className="mt-1">{f.ambition}</p>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card text-sm">
          <div className="mb-2 flex items-baseline justify-between">
            <h2>Risico&apos;s en kansen ({risks.length})</h2>
            <Link href={`/risicos?context=${encodeURIComponent(f.name)}`} className="text-xs">
              In het register →
            </Link>
          </div>
          {risks.length === 0 ? (
            <p className="text-neutral-500">Geen gekoppelde risico&apos;s of kansen.</p>
          ) : (
            <ul className="space-y-1">
              {risks.map((r) => {
                const level = riskLevel(r.likelihoodBefore * r.impactBefore);
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-2">
                    <Link href={`/risicos/${r.id}`}>
                      {riskDisplayCode(r)} {r.title}
                    </Link>
                    {riskPriority(r) === 1 && <span className="text-xs text-brand-red">★</span>}
                    <span className="text-xs text-neutral-500">
                      {r.type === "OPPORTUNITY" ? "kans" : "risico"} · {RISK_LEVEL_LABEL[level].toLowerCase()}
                      {r.ownerText && ` · ${r.ownerText}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="card text-sm">
          <div className="mb-2 flex items-baseline justify-between">
            <h2>
              Significante milieuaspecten ({aspects.length} van {aspectTotal})
            </h2>
            <Link href={`/milieuaspecten?context=${encodeURIComponent(f.name)}&werking=ja`} className="text-xs">
              Alle {aspectTotal} in het MAR →
            </Link>
          </div>
          {aspects.length === 0 ? (
            <p className="text-neutral-500">Geen significante milieuaspecten.</p>
          ) : (
            <ul className="max-h-96 space-y-1 overflow-y-auto">
              {aspects.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2">
                  {a.priority && <Badge className={ASPECT_PRIORITY_CLASS[a.priority]}>{ASPECT_PRIORITY_SHORT[a.priority]}</Badge>}
                  <Link href={`/milieuaspecten/${a.id}`}>
                    {aspectDisplayCode(a)} {a.aspect}
                  </Link>
                  <span className="text-xs text-neutral-500">
                    {[a.businessUnit, a.locationText].filter(Boolean).join(" · ")}
                    {a.opportunity && " · kans"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {section && analysis && (
        <section className="card mt-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2>
              <span className="mr-2 text-neutral-400 tabular-nums">{section.number}</span>
              {section.title}
            </h2>
            <Link href={`/context#${section.anchor}`} className="text-xs">
              In de analyse →
            </Link>
          </div>
          <div className="doc" dangerouslySetInnerHTML={{ __html: sanitizeContextHtml(section.html) }} />
        </section>
      )}

      {canEdit && (
        <div className="mt-6">
          <Disclosure summary="Contextfactor wijzigen">
            <ContextFactorForm key={f.updatedAt.toISOString()} factor={f} formAction={updateFactor.bind(null, id)} submitLabel="Opslaan" />
            <Form action={deleteFactor.bind(null, id)} className="mt-4 border-t border-neutral-200 pt-3">
              <SubmitButton variant="link" confirm={`"${f.name}" verwijderen?`}>
                Verwijderen
              </SubmitButton>
            </Form>
          </Disclosure>
        </div>
      )}
    </>
  );
}
