import { RiskCharts } from "@/components/module-charts";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { getLookups, getRequirementOptions } from "@/lib/lookups";
import { formatDate, isOverdue } from "@/lib/format";
import { RISK_CATEGORY_LABEL, RISK_STATUS_LABEL, TREATMENT_STATUS_CLASS, TREATMENT_STATUS_LABEL, options } from "@/lib/labels";
import { PRIORITY_LABEL, RISK_LEVEL_LABEL, residual, riskDisplayCode, riskLevel, riskPriority, type RiskLevel } from "@/lib/risk";
import { Badge, Disclosure, EmptyState, Field, PageHeader, Select } from "@/components/ui";
import { RiskMatrix, ScoreBadge } from "@/components/risk-matrix";
import { RiskForm } from "@/components/risk-form";
import { riskWhere, type RiskSearch } from "@/lib/risk-filters";
import { createRisk } from "./actions";

export const metadata = { title: "Risico's en kansen" };

type Search = RiskSearch;

const LEVELS = Object.keys(RISK_LEVEL_LABEL) as RiskLevel[];

export default async function RisksPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const basis = sp.basis === "bruto" ? "bruto" : "rest";
  const status = sp.status ?? "actief";

  const where = riskWhere(sp);

  const [allRisks, lookups, processes, norms, requirementGroups] = await Promise.all([
    prisma.risk.findMany({
      where,
      include: {
        owner: { select: { name: true } },
        disciplines: { select: { name: true }, orderBy: { sortOrder: "asc" } },
        location: { select: { name: true } },
        processes: { select: { id: true, name: true } },
        _count: { select: { actions: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } } } } },
      },
      take: 2000,
    }),
    getLookups(),
    prisma.process.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.norm.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }], select: { id: true, code: true } }),
    getRequirementOptions(),
  ]);

  // Positie in de matrix: bruto (vóór maatregelen) of rest (na maatregelen).
  const position = (r: (typeof allRisks)[number]) => (basis === "bruto" ? { likelihood: r.likelihoodBefore, impact: r.impactBefore } : residual(r));

  // Matrices tellen alle items binnen de filters (behalve cel/klasse), zodat je kunt doorklikken.
  const counts = { RISK: {} as Record<string, number>, OPPORTUNITY: {} as Record<string, number> };
  for (const r of allRisks) {
    const p = position(r);
    const key = `${p.likelihood}-${p.impact}`;
    counts[r.type][key] = (counts[r.type][key] ?? 0) + 1;
  }

  const [cellL, cellI] = (sp.cel ?? "").split("-").map(Number);
  const selectedCell = cellL && cellI ? { likelihood: cellL, impact: cellI } : null;
  const level = LEVELS.includes(sp.klasse as RiskLevel) ? (sp.klasse as RiskLevel) : null;

  const risks = allRisks
    .filter((r) => {
      const p = position(r);
      if (selectedCell && (p.likelihood !== selectedCell.likelihood || p.impact !== selectedCell.impact)) return false;
      if (level && riskLevel(p.likelihood * p.impact) !== level) return false;
      if (sp.prioriteit === "2" || sp.prioriteit === "3") {
        if (String(riskPriority(r)) !== sp.prioriteit) return false;
      }
      return true;
    })
    // Eerst risico's, dan kansen; binnen elk: prioriteit (★ strategisch bovenaan), dan hoogste score, dan eigen nummer.
    .sort(
      (a, b) =>
        (a.type === b.type ? 0 : a.type === "RISK" ? -1 : 1) ||
        riskPriority(a) - riskPriority(b) ||
        residual(b).score - residual(a).score ||
        riskDisplayCode(a).localeCompare(riskDisplayCode(b), "nl", { numeric: true }),
    );

  const query = (patch: Partial<Search>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return `/risicos${s ? `?${s}` : ""}`;
  };
  const exportQuery = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && !["cel", "klasse", "basis"].includes(k)) as [string, string][]).toString();
  const showRisk = sp.soort !== "OPPORTUNITY";
  const showOpp = sp.soort !== "RISK";

  return (
    <>
      <PageHeader
        title="Risico's en kansen"
        description="Risico- en kansenregister inclusief RI&E. Beoordeling met de 5×5-matrix (kans × effect), vóór en na maatregelen, met eigenaar en acties."
        actions={
          <>
            {can(user.role, "risks.editAny") && (
              <Link href="/risicos/import" className="btn-secondary">
                Importeren uit Excel
              </Link>
            )}
            <a href={`/risicos/export${exportQuery ? `?${exportQuery}` : ""}`} className="btn-secondary">
              Exporteren naar Excel (CSV)
            </a>
          </>
        }
      />
      <RiskCharts />

      {can(user.role, "risks.create") && (
        <div className="mb-6">
          <Disclosure summary="Nieuw risico of nieuwe kans">
            <RiskForm
              formAction={createRisk}
              lookups={lookups}
              processOptions={processes.map((p) => ({ value: p.id, label: p.name }))}
              requirementGroups={requirementGroups}
              submitLabel="Opslaan"
            />
          </Disclosure>
        </div>
      )}

      <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <Field label="Zoeken">
          <input name="q" defaultValue={sp.q} className="input w-48" />
        </Field>
        <Field label="Soort">
          <Select
            name="soort"
            options={[
              { value: "RISK", label: "Risico's" },
              { value: "OPPORTUNITY", label: "Kansen" },
            ]}
            defaultValue={sp.soort}
            placeholder="Beide"
          />
        </Field>
        <Field label="Categorie">
          <Select name="categorie" options={options(RISK_CATEGORY_LABEL)} defaultValue={sp.categorie} placeholder="Alle" />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={status} className="input">
            <option value="actief">Open + beheerst</option>
            {options(RISK_STATUS_LABEL).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            <option value="alle">Alle</option>
          </select>
        </Field>
        <Field label="Proces">
          <Select
            name="proces"
            options={processes.map((p) => ({ value: p.id, label: p.name }))}
            defaultValue={sp.proces}
            placeholder="Alle"
            className="max-w-56"
          />
        </Field>
        <Field label="Norm">
          <Select name="norm" options={norms.map((n) => ({ value: n.id, label: n.code }))} defaultValue={sp.norm} placeholder="Alle" />
        </Field>
        <Field label="Discipline">
          <Select name="discipline" options={lookups.disciplines} defaultValue={sp.discipline} placeholder="Alle" />
        </Field>
        <Field label="Locatie">
          <Select name="locatie" options={lookups.locations} defaultValue={sp.locatie} placeholder="Alle" />
        </Field>
        <Field label="Prioriteit">
          <Select
            name="prioriteit"
            options={[
              { value: "1", label: "★ 1 · Strategisch" },
              { value: "2", label: "2 · Hoog" },
              { value: "3", label: "3 · Regulier" },
            ]}
            defaultValue={sp.prioriteit}
            placeholder="Alle"
          />
        </Field>
        <Field label="Aanpak">
          <Select name="aanpak" options={options(TREATMENT_STATUS_LABEL)} defaultValue={sp.aanpak} placeholder="Alle" />
        </Field>
        <Field label="Klasse">
          <Select name="klasse" options={LEVELS.map((l) => ({ value: l, label: RISK_LEVEL_LABEL[l] }))} defaultValue={sp.klasse} placeholder="Alle" />
        </Field>
        <input type="hidden" name="basis" value={basis} />
        <button className="btn-secondary">Filteren</button>
        <Link href="/risicos" className="btn-link self-center">
          Wissen
        </Link>
      </form>

      <section className="card mb-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-neutral-300 text-sm" role="group" aria-label="Basis van de matrix">
            <Link
              href={query({ basis: "bruto", cel: undefined })}
              className={`px-3 py-1.5 no-underline hover:no-underline ${basis === "bruto" ? "bg-brand-red text-white" : "text-neutral-700"}`}
            >
              Vóór maatregelen
            </Link>
            <Link
              href={query({ basis: "rest", cel: undefined })}
              className={`px-3 py-1.5 no-underline hover:no-underline ${basis === "rest" ? "bg-brand-red text-white" : "text-neutral-700"}`}
            >
              Na maatregelen (rest)
            </Link>
          </div>
          {selectedCell && (
            <span className="text-sm">
              Gefilterd op cel kans {selectedCell.likelihood} × effect {selectedCell.impact} ·{" "}
              <Link href={query({ cel: undefined })} scroll={false}>
                filter wissen
              </Link>
            </span>
          )}
        </div>
        <div className={`grid gap-8 ${showRisk && showOpp ? "md:grid-cols-2" : "max-w-md"}`}>
          {showRisk && (
            <RiskMatrix
              type="RISK"
              title={`Risico's (${Object.values(counts.RISK).reduce((a, b) => a + b, 0)})`}
              counts={counts.RISK}
              selected={sp.soort === "RISK" ? selectedCell : null}
              href={(c) => query({ cel: `${c.likelihood}-${c.impact}`, soort: "RISK" })}
            />
          )}
          {showOpp && (
            <RiskMatrix
              type="OPPORTUNITY"
              title={`Kansen (${Object.values(counts.OPPORTUNITY).reduce((a, b) => a + b, 0)})`}
              counts={counts.OPPORTUNITY}
              selected={sp.soort === "OPPORTUNITY" ? selectedCell : null}
              href={(c) => query({ cel: `${c.likelihood}-${c.impact}`, soort: "OPPORTUNITY" })}
            />
          )}
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          Klik op een cel om de lijst te filteren. Niveaus: laag 1–7, midden 8–14, hoog 15–25. Bij kansen betekent een hogere score een aantrekkelijkere kans.
        </p>
      </section>

      {risks.length === 0 ? (
        <EmptyState>Geen risico&apos;s of kansen gevonden met deze filters.</EmptyState>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Prio</th>
                <th>Omschrijving</th>
                <th className="text-center">Bruto</th>
                <th className="text-center">Rest</th>
                <th>Eigenaar</th>
                <th>Aanpak</th>
                <th className="text-center">Open acties</th>
                <th>Beoordelen vóór</th>
              </tr>
            </thead>
            <tbody>
              {risks.map((r) => {
                const res = residual(r);
                const reviewOverdue = r.status !== "CLOSED" && isOverdue(r.reviewDate);
                return (
                  <tr key={r.id} className={r.strategic ? "bg-red-50/40" : ""}>
                    <td className="font-mono text-xs whitespace-nowrap">{riskDisplayCode(r)}</td>
                    <td className="text-xs whitespace-nowrap" title={PRIORITY_LABEL[riskPriority(r)]}>
                      {riskPriority(r) === 1 ? <span className="font-semibold text-brand-red">★ 1</span> : riskPriority(r)}
                    </td>
                    <td>
                      <Link href={`/risicos/${r.id}`} className="font-medium">
                        {r.title}
                      </Link>
                      <div className="text-xs text-neutral-500">
                        {[
                          r.theme ?? RISK_CATEGORY_LABEL[r.category],
                          r.disciplines.length ? r.disciplines.map((d) => d.name).join(", ") : "Groep",
                          r.location?.name,
                          r.term,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        {r.processes.length > 0 && <> · {r.processes.map((p) => p.name).join(", ")}</>}
                      </div>
                    </td>
                    <td className="text-center">
                      <ScoreBadge likelihood={r.likelihoodBefore} impact={r.impactBefore} type={r.type} />
                    </td>
                    <td className="text-center">
                      {res.assessed ? (
                        <ScoreBadge likelihood={res.likelihood} impact={res.impact} type={r.type} />
                      ) : (
                        <span className="text-xs text-neutral-400">n.t.b.</span>
                      )}
                    </td>
                    <td className="text-sm">{r.ownerText ?? r.owner?.name ?? <span className="text-brand-red">Geen</span>}</td>
                    <td>
                      <Badge className={TREATMENT_STATUS_CLASS[r.treatmentStatus]}>{TREATMENT_STATUS_LABEL[r.treatmentStatus]}</Badge>
                      {r.status !== "OPEN" && <div className="mt-0.5 text-xs text-neutral-500">{RISK_STATUS_LABEL[r.status].split(" —")[0]}</div>}
                    </td>
                    <td className={`text-center tabular-nums ${r._count.actions === 0 ? "text-neutral-300" : ""}`}>{r._count.actions}</td>
                    <td className={`whitespace-nowrap ${reviewOverdue ? "font-semibold text-brand-red" : ""}`}>
                      {formatDate(r.reviewDate)}
                      {reviewOverdue && " ⚠"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
