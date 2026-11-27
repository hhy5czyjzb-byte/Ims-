import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { getLookups } from "@/lib/lookups";
import { getLegalLinkOptions } from "@/lib/legal-links";
import { formatDate, isOverdue } from "@/lib/format";
import { complianceSummary, legalCode } from "@/lib/compliance";
import { legalWhere, type LegalSearch } from "@/lib/legal-filters";
import { COMPLIANCE_STATUS_CLASS, COMPLIANCE_STATUS_LABEL, LEGAL_CATEGORY_LABEL, options } from "@/lib/labels";
import { Badge, Disclosure, EmptyState, Field, PageHeader, ProgressBar, Select } from "@/components/ui";
import { LegalForm } from "@/components/legal-form";
import { createLegal } from "./actions";

export const metadata = { title: "Wet- en regelgeving" };

export default async function LegalRegisterPage({ searchParams }: { searchParams: Promise<LegalSearch> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const canEdit = can(user.role, "legal.edit");

  const [reqs, allActive, lookups, linkOptions] = await Promise.all([
    prisma.legalRequirement.findMany({
      where: legalWhere(sp, user.id),
      orderBy: [{ title: "asc" }, { article: "asc" }, { number: "asc" }],
      include: {
        owner: { select: { name: true } },
        discipline: { select: { name: true } },
        location: { select: { name: true } },
        _count: { select: { actions: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } } } } },
      },
      take: 3000,
    }),
    prisma.legalRequirement.findMany({ where: { active: true }, select: { status: true, nextReviewDate: true } }),
    getLookups(),
    canEdit ? getLegalLinkOptions() : Promise.resolve(null),
  ]);

  const summary = complianceSummary(allActive.map((r) => r.status));
  const overdue = allActive.filter((r) => r.status !== "NOT_APPLICABLE" && isOverdue(r.nextReviewDate)).length;
  const exportQuery = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader
        title="Wet- en regelgeving"
        description="Register van wettelijke eisen en andere bindende verplichtingen met per eis een compliancestatus. Toetsingen worden vastgelegd als bewijs voor ISO 14001 (6.1.3 en 9.1.2) en de andere normen."
        actions={
          <>
            {canEdit && (
              <Link href="/wetgeving/import" className="btn-secondary">
                Importeren uit Excel
              </Link>
            )}
            <a href={`/wetgeving/export${exportQuery ? `?${exportQuery}` : ""}`} className="btn-secondary">
              Exporteren (CSV)
            </a>
          </>
        }
      />

      <section className="card mb-6">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <h2>Compliancegraad</h2>
              <span className="text-xs text-neutral-500">{summary.relevant} relevante eisen (n.v.t. telt niet mee)</span>
            </div>
            <ProgressBar value={summary.pct} />
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <StatusLink href="/wetgeving?status=COMPLIANT" n={summary.compliant} status="COMPLIANT" />
            <StatusLink href="/wetgeving?status=PARTIAL" n={summary.partial} status="PARTIAL" />
            <StatusLink href="/wetgeving?status=NON_COMPLIANT" n={summary.nonCompliant} status="NON_COMPLIANT" />
            <StatusLink href="/wetgeving?status=NOT_ASSESSED" n={summary.notAssessed} status="NOT_ASSESSED" />
            <Link href="/wetgeving?toetsing=verlopen" className="no-underline">
              <Badge className={overdue ? "bg-red-50 text-brand-red-dark ring-1 ring-brand-red/30" : "bg-neutral-100 text-neutral-600"}>
                {overdue} toetsing verlopen
              </Badge>
            </Link>
          </div>
        </div>
      </section>

      {canEdit && linkOptions && (
        <div className="mb-6">
          <Disclosure summary="Eis toevoegen">
            <LegalForm formAction={createLegal} lookups={lookups} linkOptions={linkOptions} submitLabel="Opslaan" />
          </Disclosure>
        </div>
      )}

      <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <Field label="Zoeken">
          <input name="q" defaultValue={sp.q} className="input w-52" placeholder="Wet, artikel, onderwerp…" />
        </Field>
        <Field label="Status">
          <Select
            name="status"
            options={[{ value: "actie", label: "Actie nodig (niet / deels)" }, ...options(COMPLIANCE_STATUS_LABEL)]}
            defaultValue={sp.status}
            placeholder="Alle"
          />
        </Field>
        <Field label="Toetsing">
          <Select
            name="toetsing"
            options={[
              { value: "verlopen", label: "Verlopen" },
              { value: "30dagen", label: "Binnen 30 dagen" },
              { value: "nooit", label: "Nog nooit getoetst" },
            ]}
            defaultValue={sp.toetsing}
            placeholder="Alle"
          />
        </Field>
        <Field label="Categorie">
          <Select name="categorie" options={options(LEGAL_CATEGORY_LABEL)} defaultValue={sp.categorie} placeholder="Alle" />
        </Field>
        <Field label="Discipline">
          <Select name="discipline" options={lookups.disciplines} defaultValue={sp.discipline} placeholder="Alle" />
        </Field>
        <Field label="Locatie">
          <Select name="locatie" options={lookups.locations} defaultValue={sp.locatie} placeholder="Alle" />
        </Field>
        <Field label="Eigenaar">
          <Select name="eigenaar" options={[{ value: "mij", label: "Mijn eisen" }, ...lookups.users]} defaultValue={sp.eigenaar} placeholder="Iedereen" />
        </Field>
        <Field label="Actief">
          <Select
            name="actief"
            options={[
              { value: "nee", label: "Vervallen" },
              { value: "alle", label: "Alle" },
            ]}
            defaultValue={sp.actief}
            placeholder="Actief"
          />
        </Field>
        <button className="btn-secondary">Filteren</button>
        <Link href="/wetgeving" className="btn-link self-center">
          Wissen
        </Link>
      </form>

      {reqs.length === 0 ? (
        <EmptyState>
          Geen eisen gevonden.
          {canEdit && allActive.length === 0 && (
            <>
              {" "}
              Begin met <Link href="/wetgeving/import">importeren uit Excel</Link> of voeg een eis toe.
            </>
          )}
        </EmptyState>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Wet / eis</th>
                <th>Eigenaar</th>
                <th>Status</th>
                <th>Laatst getoetst</th>
                <th>Volgende toetsing</th>
                <th className="text-center">Open acties</th>
              </tr>
            </thead>
            <tbody>
              {reqs.map((r) => {
                const late = r.active && r.status !== "NOT_APPLICABLE" && isOverdue(r.nextReviewDate);
                return (
                  <tr key={r.id} className={r.active ? "" : "opacity-50"}>
                    <td className="font-mono text-xs whitespace-nowrap">
                      {legalCode(r.number)}
                      {r.externalRef && <div className="text-neutral-400">{r.externalRef}</div>}
                    </td>
                    <td>
                      <Link href={`/wetgeving/${r.id}`} className="font-medium">
                        {r.title}
                        {r.article && <span className="font-normal"> — {r.article}</span>}
                      </Link>
                      <div className="text-xs text-neutral-500">
                        {[r.subject, LEGAL_CATEGORY_LABEL[r.category], r.discipline?.name ?? "Bedrijfsbreed", r.location?.name ?? "Alle locaties"]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </td>
                    <td>{r.owner?.name ?? <span className="text-brand-red">Geen</span>}</td>
                    <td>
                      <Badge className={COMPLIANCE_STATUS_CLASS[r.status]}>{COMPLIANCE_STATUS_LABEL[r.status]}</Badge>
                    </td>
                    <td className="whitespace-nowrap">{formatDate(r.lastReviewDate)}</td>
                    <td className={`whitespace-nowrap ${late ? "font-semibold text-brand-red" : ""}`}>
                      {formatDate(r.nextReviewDate)}
                      {late && " ⚠"}
                    </td>
                    <td
                      className={`text-center tabular-nums ${r._count.actions === 0 ? (r.status === "NON_COMPLIANT" ? "font-semibold text-brand-red" : "text-neutral-300") : ""}`}
                      title={r.status === "NON_COMPLIANT" && r._count.actions === 0 ? "Voldoet niet, maar er loopt geen actie" : undefined}
                    >
                      {r._count.actions}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-neutral-500">
        {reqs.length} {reqs.length === 1 ? "eis" : "eisen"} getoond. ⚠ = toetsing verlopen.
      </p>
    </>
  );
}

function StatusLink({ href, n, status }: { href: string; n: number; status: keyof typeof COMPLIANCE_STATUS_LABEL }) {
  return (
    <Link href={href} className="no-underline">
      <Badge className={COMPLIANCE_STATUS_CLASS[status]}>
        {n} {COMPLIANCE_STATUS_LABEL[status].toLowerCase()}
      </Badge>
    </Link>
  );
}
