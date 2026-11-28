import { AuditCharts } from "@/components/module-charts";
import Link from "next/link";
import type { AuditStatus, AuditType, Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { getLookups } from "@/lib/lookups";
import { formatDate } from "@/lib/format";
import { auditCode } from "@/lib/audit-plan";
import { AUDIT_STATUS_CLASS, AUDIT_STATUS_LABEL, AUDIT_TYPE_CLASS, AUDIT_TYPE_LABEL, AUDIT_TYPE_SHORT, options } from "@/lib/labels";
import { Badge, Disclosure, EmptyState, Field, PageHeader, Select, StatCard } from "@/components/ui";
import { AuditForm } from "@/components/audit-form";
import { createAudit } from "./actions";

export const metadata = { title: "Audits" };

type Search = { jaar?: string; soort?: string; status?: string; norm?: string; locatie?: string; discipline?: string };

const MONTHS = ["Januari", "Februari", "Maart", "April", "Mei", "Juni", "Juli", "Augustus", "September", "Oktober", "November", "December"];

export default async function AuditsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const thisYear = new Date().getFullYear();
  const year = Number(sp.jaar) >= 2000 && Number(sp.jaar) <= 2100 ? Number(sp.jaar) : thisYear;

  const where: Prisma.AuditWhereInput = {
    plannedDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
    ...(sp.soort && sp.soort in AUDIT_TYPE_LABEL ? { type: sp.soort as AuditType } : {}),
    ...(sp.status && sp.status in AUDIT_STATUS_LABEL ? { status: sp.status as AuditStatus } : {}),
    ...(sp.norm ? { norms: { some: { id: sp.norm } } } : {}),
    ...(sp.locatie ? { locationId: sp.locatie } : {}),
    ...(sp.discipline ? { disciplineId: sp.discipline } : {}),
  };

  const [audits, lookups, norms, openFindings] = await Promise.all([
    prisma.audit.findMany({
      where,
      orderBy: [{ plannedDate: "asc" }, { number: "asc" }],
      include: {
        norms: { select: { id: true, code: true }, orderBy: { sortOrder: "asc" } },
        location: { select: { name: true } },
        discipline: { select: { name: true } },
        findings: { select: { classification: true, status: true } },
        _count: { select: { checklist: true } },
      },
    }),
    getLookups(),
    prisma.norm.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }], select: { id: true, code: true } }),
    prisma.auditFinding.groupBy({ by: ["classification"], where: { status: "OPEN" }, _count: true }),
  ]);

  const openOf = (c: "MAJOR" | "MINOR" | "OBSERVATION") => openFindings.find((f) => f.classification === c)?._count ?? 0;
  const planned = audits.filter((a) => a.status === "PLANNED" || a.status === "IN_PROGRESS").length;
  const completed = audits.filter((a) => a.status === "COMPLETED").length;
  const byMonth = MONTHS.map((name, m) => ({ name, audits: audits.filter((a) => a.plannedDate.getUTCMonth() === m) })).filter((g) => g.audits.length);
  const normOptions = norms.map((n) => ({ value: n.id, label: n.code }));

  return (
    <>
      <PageHeader
        title="Audits"
        description="Interne audits, externe audits door de certificatie-instelling en klantaudits in één planning, met checklist per norm en bevindingen met opvolging via acties."
        actions={
          <Link href="/audits/cyclus" className="btn-secondary">
            Auditplanning certificatiecyclus
          </Link>
        }
      />
      <AuditCharts />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label={`Gepland ${year}`} value={planned} />
        <StatCard label={`Afgerond ${year}`} value={completed} tone="ok" />
        <StatCard label="Open majors" value={openOf("MAJOR")} tone={openOf("MAJOR") ? "alert" : "ok"} hint="alle jaren" />
        <StatCard label="Open minors" value={openOf("MINOR")} tone={openOf("MINOR") ? "alert" : "ok"} hint="alle jaren" />
        <StatCard label="Open observaties" value={openOf("OBSERVATION")} hint="alle jaren" />
      </div>

      {can(user.role, "audits.edit") && (
        <div className="mb-6">
          <Disclosure summary="Audit plannen">
            <AuditForm formAction={createAudit} lookups={lookups} normOptions={normOptions} submitLabel="Audit plannen" />
          </Disclosure>
        </div>
      )}

      <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <Field label="Jaar">
          <select name="jaar" defaultValue={String(year)} className="input">
            {Array.from({ length: 7 }, (_, i) => thisYear - 3 + i).map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </Field>
        <Field label="Soort">
          <Select name="soort" options={options(AUDIT_TYPE_LABEL)} defaultValue={sp.soort} placeholder="Alle" />
        </Field>
        <Field label="Status">
          <Select name="status" options={options(AUDIT_STATUS_LABEL)} defaultValue={sp.status} placeholder="Alle" />
        </Field>
        <Field label="Norm">
          <Select name="norm" options={normOptions} defaultValue={sp.norm} placeholder="Alle" />
        </Field>
        <Field label="Locatie">
          <Select name="locatie" options={lookups.locations} defaultValue={sp.locatie} placeholder="Alle" />
        </Field>
        <Field label="Discipline">
          <Select name="discipline" options={lookups.disciplines} defaultValue={sp.discipline} placeholder="Alle" />
        </Field>
        <button className="btn-secondary">Filteren</button>
      </form>

      {byMonth.length === 0 ? (
        <EmptyState>Geen audits in {year} met deze filters.</EmptyState>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Audit</th>
                <th>Datum</th>
                <th>Normen</th>
                <th>Status</th>
                <th className="text-center">Bevindingen</th>
              </tr>
            </thead>
            {byMonth.map((g) => (
              <tbody key={g.name}>
                <tr>
                  <td colSpan={6} className="bg-neutral-50 text-xs font-semibold tracking-wide text-neutral-600 uppercase">
                    {g.name} {year}
                  </td>
                </tr>
                {g.audits.map((a) => {
                  const count = (c: string) => a.findings.filter((f) => f.classification === c).length;
                  const open = a.findings.filter((f) => f.status === "OPEN").length;
                  const late = (a.status === "PLANNED" || a.status === "IN_PROGRESS") && a.plannedDate < new Date(new Date().toISOString().slice(0, 10));
                  return (
                    <tr key={a.id}>
                      <td className="font-mono text-xs whitespace-nowrap">{auditCode(a.number)}</td>
                      <td>
                        <Badge className={`mr-1.5 ${AUDIT_TYPE_CLASS[a.type]}`}>{AUDIT_TYPE_SHORT[a.type]}</Badge>
                        <Link href={`/audits/${a.id}`} className="font-medium">
                          {a.title}
                        </Link>
                        <div className="text-xs text-neutral-500">
                          {a.location?.name ?? "Alle locaties"} · {a.discipline?.name ?? "Bedrijfsbreed"}
                          {a.certificationBody && <> · {a.certificationBody}</>}
                          {a._count.checklist > 0 && <> · {a._count.checklist} eisen op checklist</>}
                        </div>
                      </td>
                      <td className={`whitespace-nowrap ${late ? "font-semibold text-brand-red" : ""}`}>
                        {formatDate(a.completedDate ?? a.plannedDate)}
                        {late && " ⚠"}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {a.norms.map((n) => (
                            <Badge key={n.id} className="bg-brand-grey-light text-neutral-900">
                              {n.code}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td>
                        <Badge className={AUDIT_STATUS_CLASS[a.status]}>{AUDIT_STATUS_LABEL[a.status]}</Badge>
                      </td>
                      <td className="text-center text-xs whitespace-nowrap">
                        {a.findings.length === 0 ? (
                          <span className="text-neutral-300">—</span>
                        ) : (
                          <span title="Major / minor / observatie">
                            <span className={count("MAJOR") ? "font-bold text-brand-red" : ""}>{count("MAJOR")}</span> / {count("MINOR")} /{" "}
                            {count("OBSERVATION")}
                            {open > 0 && <span className="block text-brand-red-dark">{open} open</span>}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-neutral-500">Bevindingen: major / minor / observatie. ⚠ = geplande datum verstreken, nog niet afgerond.</p>
    </>
  );
}
