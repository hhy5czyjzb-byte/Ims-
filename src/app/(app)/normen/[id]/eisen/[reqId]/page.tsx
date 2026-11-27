import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { can } from "@/lib/rbac";
import { flattenTree } from "@/lib/tree";
import { riskCode } from "@/lib/risk";
import { LegalLinkItems, legalLinkSelect } from "@/components/legal-links";
import { AspectLinkItems, aspectLinkSelect } from "@/components/aspect-links";
import { auditCode, findingCode } from "@/lib/audit-plan";
import { formatDate } from "@/lib/format";
import {
  ACTION_STATUS_CLASS,
  ACTION_STATUS_LABEL,
  CHECKLIST_RESULT_CLASS,
  CHECKLIST_RESULT_LABEL,
  FINDING_CLASS_CLASS,
  FINDING_CLASS_SHORT,
  FINDING_STATUS_LABEL,
} from "@/lib/labels";
import { Badge, Disclosure, Field, PageHeader, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { deleteRequirement, updateRequirement } from "../../../actions";
import { Form } from "@/components/form";

export default async function RequirementPage({ params }: { params: Promise<{ id: string; reqId: string }> }) {
  const { id, reqId } = await params;
  const user = await requireUser();
  const req = await prisma.normRequirement.findUnique({
    where: { id: reqId },
    include: {
      norm: { include: { requirements: { select: { id: true, clause: true, title: true, parentId: true, sortOrder: true } } } },
      parent: true,
      children: { orderBy: { clause: "asc" } },
      documents: { orderBy: { title: "asc" } },
      processes: { orderBy: { name: "asc" } },
      processSteps: { include: { process: true }, orderBy: { sortOrder: "asc" } },
      risks: { orderBy: { title: "asc" } },
      actions: { orderBy: { number: "desc" } },
      legalRequirements: { select: legalLinkSelect, orderBy: { number: "asc" } },
      environmentalAspects: { select: aspectLinkSelect, orderBy: { number: "asc" } },
      checklistItems: { include: { audit: { select: { id: true, number: true, title: true, status: true, plannedDate: true, completedDate: true } } } },
      findings: { include: { audit: { select: { id: true, number: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!req || req.normId !== id) notFound();
  await logAudit({ user, action: "VIEW", entityType: "NormRequirement", entityId: reqId });

  const canEdit = can(user.role, "norms.edit");
  const parentOptions = flattenTree(req.norm.requirements)
    .filter((r) => r.id !== req.id)
    .map((r) => ({ value: r.id, label: `${"  ".repeat(r.depth)}${r.clause} ${r.title}` }));

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/normen", label: "Normenbeheer" },
          { href: `/normen/${id}`, label: req.norm.code },
        ]}
        title={`${req.clause} ${req.title}`}
        description={req.description ?? undefined}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Documenten" empty="Nog geen documenten gekoppeld. Koppel vanuit Documentbeheer.">
          {req.documents.map((d) => (
            <li key={d.id}>
              <Link href={`/documenten/${d.id}`}>{d.title}</Link>
              {d.documentNumber && <span className="ml-1 text-xs text-neutral-500">{d.documentNumber}</span>}
            </li>
          ))}
        </Section>
        <Section title="Processen en processtappen" empty="Nog geen processen gekoppeld. Koppel vanuit Processen.">
          {req.processes.map((p) => (
            <li key={p.id}>
              <Link href={`/processen/${p.id}`}>{p.name}</Link> <span className="text-xs text-neutral-500">(proces)</span>
            </li>
          ))}
          {req.processSteps.map((s) => (
            <li key={s.id}>
              <Link href={`/processen/${s.processId}?stap=${s.id}`}>
                {s.process.name} › {s.name}
              </Link>{" "}
              <span className="text-xs text-neutral-500">(stap)</span>
            </li>
          ))}
        </Section>
        <Section title="Risico's en kansen" empty="Nog geen risico's of kansen gekoppeld. Koppel vanuit Risico's en kansen.">
          {req.risks.map((r) => (
            <li key={r.id}>
              <Link href={`/risicos/${r.id}`}>
                {riskCode(r.number, r.type)} {r.title}
              </Link>
            </li>
          ))}
        </Section>
        <Section title="Wet- en regelgeving" empty="Geen wettelijke eisen gekoppeld. Koppel vanuit Wet- en regelgeving.">
          {req.legalRequirements.length > 0 && <LegalLinkItems items={req.legalRequirements} />}
        </Section>
        <Section title="Milieuaspecten" empty="Geen milieuaspecten gekoppeld. Koppel vanuit Milieuaspecten.">
          {req.environmentalAspects.length > 0 && <AspectLinkItems items={req.environmentalAspects} />}
        </Section>
        <Section title="Audits" empty="Nog niet in een audit opgenomen.">
          {[...req.checklistItems]
            .sort((a, b) => (b.audit.completedDate ?? b.audit.plannedDate).getTime() - (a.audit.completedDate ?? a.audit.plannedDate).getTime())
            .map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/audits/${c.audit.id}`}>
                  {auditCode(c.audit.number)} {c.audit.title}
                </Link>
                <span className="text-xs text-neutral-500">{formatDate(c.audit.completedDate ?? c.audit.plannedDate)}</span>
                <Badge className={CHECKLIST_RESULT_CLASS[c.result]}>{CHECKLIST_RESULT_LABEL[c.result]}</Badge>
              </li>
            ))}
          {req.findings.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-2">
              <Badge className={FINDING_CLASS_CLASS[f.classification]}>{FINDING_CLASS_SHORT[f.classification]}</Badge>
              <Link href={`/audits/${f.audit.id}/bevindingen/${f.id}`}>Bevinding {findingCode(f.audit.number, f.number)}</Link>
              <span className="text-xs text-neutral-500">{FINDING_STATUS_LABEL[f.status]}</span>
            </li>
          ))}
        </Section>
        <Section title="Acties" empty="Geen acties gekoppeld.">
          {req.actions.map((a) => (
            <li key={a.id} className="flex items-center gap-2">
              <Link href={`/acties/${a.id}`}>
                #{a.number} {a.title}
              </Link>
              <Badge className={ACTION_STATUS_CLASS[a.status]}>{ACTION_STATUS_LABEL[a.status]}</Badge>
            </li>
          ))}
        </Section>
      </div>

      {req.children.length > 0 && (
        <div className="card mt-4">
          <h2 className="mb-2">Onderliggende eisen</h2>
          <ul className="space-y-1 text-sm">
            {req.children.map((c) => (
              <li key={c.id}>
                <Link href={`/normen/${id}/eisen/${c.id}`}>
                  {c.clause} {c.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {canEdit && (
        <div className="mt-6">
          <Disclosure summary="Eis wijzigen">
            <Form action={updateRequirement.bind(null, id, req.id)} className="grid gap-3 sm:grid-cols-4">
              <Field label="Paragraaf">
                <input name="clause" required defaultValue={req.clause} className="input" />
              </Field>
              <Field label="Titel" className="sm:col-span-3">
                <input name="title" required defaultValue={req.title} className="input" />
              </Field>
              <Field label="Onder" className="sm:col-span-3">
                <Select name="parentId" options={parentOptions} defaultValue={req.parentId} placeholder="— Hoofdniveau —" />
              </Field>
              <Field label="Volgorde">
                <input name="sortOrder" type="number" defaultValue={req.sortOrder} className="input" />
              </Field>
              <Field label="Toelichting / eistekst" className="sm:col-span-4">
                <textarea name="description" rows={4} defaultValue={req.description ?? ""} className="input" />
              </Field>
              <div className="sm:col-span-4">
                <SubmitButton>Opslaan</SubmitButton>
              </div>
            </Form>
            <Form action={deleteRequirement.bind(null, id, req.id)} className="mt-4 border-t border-neutral-200 pt-3">
              <SubmitButton variant="link" confirm="Deze eis (en onderliggende eisen) verwijderen? Koppelingen gaan verloren.">
                Eis verwijderen
              </SubmitButton>
            </Form>
          </Disclosure>
        </div>
      )}
    </>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] | React.ReactNode }) {
  const items = (Array.isArray(children) ? children.flat() : [children]).filter(Boolean);
  return (
    <div className="card">
      <h2 className="mb-2">{title}</h2>
      {items.length ? <ul className="space-y-1 text-sm">{items}</ul> : <p className="text-sm text-neutral-500">{empty}</p>}
    </div>
  );
}
