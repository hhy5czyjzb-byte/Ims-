import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { findingCode } from "@/lib/audit-plan";
import { findingCloseProblems } from "@/lib/corrective";
import { AUDIT_TYPE_SHORT, FINDING_CLASS_CLASS, FINDING_CLASS_LABEL } from "@/lib/labels";
import { Badge, EmptyState, Field } from "@/components/ui";
import { BarList, ChartCard, Columns, SegmentBar, lastMonths, monthKey } from "@/components/charts";
import { Filters } from "@/components/mobile-filters";

const COLORS = { open: "#f2c12e", done: "#3fa34d", bad: "#e30613", none: "#a3a3a3" };

function Tile({ href, n, label, tone }: { href: string; n: number; label: string; tone?: string }) {
  return (
    <Link href={href} className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-inherit no-underline hover:border-brand-red hover:no-underline">
      <div className={`text-2xl font-bold tabular-nums ${tone ?? ""}`}>{n}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </Link>
  );
}

/**
 * Auditbevindingen en hun opvolging (in de actielijst): per bevinding de correcties, corrigerende maatregelen en de oorzaak.
 * De bevinding zelf wordt bij de audit behandeld.
 */
export async function FindingOverview({ status = "lopend" }: { status?: string }) {
  const now = new Date();
  const yearAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const months = lastMonths(12);
  const base = (extra: Record<string, string>) => `/acties?${new URLSearchParams({ tab: "audit", ...extra }).toString()}`;
  const [findings, all] = await Promise.all([
    prisma.auditFinding.findMany({
      where: status === "CLOSED" ? { status: "CLOSED" } : status === "alle" ? {} : { status: "OPEN" },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        audit: { select: { id: true, number: true, title: true, plannedDate: true, type: true } },
        actions: { select: { id: true, number: true, title: true, status: true, kind: true, rootCause: true } },
      },
      take: 1000,
    }),
    prisma.auditFinding.findMany({
      select: {
        classification: true,
        status: true,
        rootCause: true,
        audit: { select: { plannedDate: true, type: true } },
        actions: { select: { status: true, kind: true } },
      },
    }),
  ]);
  const open = all.filter((f) => f.status === "OPEN");
  const recent = all.filter((f) => f.audit.plannedDate >= yearAgo && f.audit.plannedDate <= now);
  const ncOpen = open.filter((f) => f.classification !== "OBSERVATION");
  const noCause = ncOpen.filter((f) => !f.rootCause?.trim()).length;
  const noCorrective = ncOpen.filter((f) => !f.actions.some((a) => a.kind === "CORRECTIVE" && a.status !== "CANCELLED")).length;
  const ready = open.filter((f) => findingCloseProblems(f).length === 0).length;

  return (
    <>
      <section className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Tile href={base({})} n={open.length} label="open bevindingen" />
        <Tile
          href={base({})}
          n={open.filter((f) => f.classification === "MAJOR").length}
          label="major open"
          tone={open.some((f) => f.classification === "MAJOR") ? "text-brand-red" : ""}
        />
        <Tile href={base({})} n={open.filter((f) => f.classification === "MINOR").length} label="minor open" />
        <Tile href={base({})} n={noCause} label="major/minor zonder oorzaakanalyse" tone={noCause ? "text-amber-700" : ""} />
        <Tile href={base({})} n={noCorrective} label="zonder corrigerende maatregel" tone={noCorrective ? "text-brand-red" : ""} />
        <Tile href={base({})} n={ready} label="klaar om af te handelen" tone={ready ? "text-green-700" : ""} />
      </section>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <ChartCard title="Bevindingen per maand" subtitle="Laatste 12 maanden, naar classificatie (datum audit)" className="lg:col-span-2">
          <Columns
            periods={months.map((m) => ({ label: m.label, title: m.title }))}
            series={(["MAJOR", "MINOR", "OBSERVATION"] as const).map((c) => ({
              name: FINDING_CLASS_LABEL[c],
              values: months.map((m) => recent.filter((f) => f.classification === c && monthKey(f.audit.plannedDate) === m.key).length),
            }))}
          />
        </ChartCard>
        <ChartCard title="Opvolging open major/minor" subtitle="Correctie en corrigerende maatregel">
          <SegmentBar
            parts={[
              { label: "Met corrigerende maatregel", value: ncOpen.length - noCorrective, color: COLORS.done },
              {
                label: "Alleen correctie",
                value: ncOpen.filter(
                  (f) => !f.actions.some((a) => a.kind === "CORRECTIVE" && a.status !== "CANCELLED") && f.actions.some((a) => a.kind === "CORRECTION"),
                ).length,
                color: COLORS.open,
              },
              {
                label: "Nog geen actie",
                value: ncOpen.filter((f) => f.actions.filter((a) => a.status !== "CANCELLED").length === 0).length,
                color: COLORS.bad,
              },
            ]}
          />
          <div className="mt-4">
            <BarList
              items={(Object.keys(AUDIT_TYPE_SHORT) as (keyof typeof AUDIT_TYPE_SHORT)[])
                .map((t) => ({
                  label: { INTERNAL: "Open uit interne audits", EXTERNAL: "Open uit externe audits", CUSTOMER: "Open uit klantaudits" }[t],
                  value: open.filter((f) => f.audit.type === t).length,
                }))
                .filter((x) => x.value > 0)}
              empty="Geen open bevindingen."
            />
          </div>
        </ChartCard>
      </div>

      <Filters>
        <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
          <input type="hidden" name="tab" value="audit" />
          <Field label="Status">
            <select name="status" defaultValue={status} className="input">
              <option value="lopend">Open</option>
              <option value="CLOSED">Afgehandeld</option>
              <option value="alle">Alle</option>
            </select>
          </Field>
          <button className="btn-secondary">Filteren</button>
        </form>
      </Filters>

      {findings.length === 0 ? (
        <EmptyState>Geen auditbevindingen met deze filters.</EmptyState>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Bevinding</th>
                <th>Classificatie</th>
                <th>Oorzaak</th>
                <th>Correctie / corrigerende maatregel</th>
                <th>Afhandelen vóór</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f) => {
                const problems = f.status === "OPEN" ? findingCloseProblems(f) : [];
                const href = `/audits/${f.auditId}/bevindingen/${f.id}`;
                const live = f.actions.filter((a) => a.status !== "CANCELLED");
                return (
                  <tr key={f.id}>
                    <td className="font-mono text-xs whitespace-nowrap">
                      <Link href={href}>{findingCode(f.audit.number, f.number)}</Link>
                    </td>
                    <td>
                      <Link href={href} className="font-medium">
                        {f.description.length > 140 ? `${f.description.slice(0, 140)}…` : f.description}
                      </Link>
                      <div className="text-xs text-neutral-500">
                        {AUDIT_TYPE_SHORT[f.audit.type]} · {f.audit.title} · {formatDate(f.audit.plannedDate)}
                      </div>
                    </td>
                    <td>
                      <Badge className={FINDING_CLASS_CLASS[f.classification]}>{FINDING_CLASS_LABEL[f.classification]}</Badge>
                    </td>
                    <td className="max-w-56 text-xs">
                      {f.rootCause ? (
                        <span title={f.rootCause}>{f.rootCause.length > 80 ? `${f.rootCause.slice(0, 80)}…` : f.rootCause}</span>
                      ) : f.classification === "OBSERVATION" ? (
                        <span className="text-neutral-400">n.v.t.</span>
                      ) : (
                        <span className="font-medium text-amber-700">ontbreekt</span>
                      )}
                    </td>
                    <td className="text-xs">
                      {live.length === 0 ? (
                        <span className="text-neutral-400">nog geen actie</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {live.map((a) => (
                            <li key={a.id}>
                              <Badge
                                className={
                                  a.kind === "CORRECTIVE" ? "bg-brand-red text-white" : a.kind === "CORRECTION" ? "bg-amber-100 text-amber-900" : undefined
                                }
                              >
                                {a.kind === "CORRECTIVE" ? "CM" : a.kind === "CORRECTION" ? "Correctie" : "Actie"}
                              </Badge>{" "}
                              <Link href={`/acties/${a.id}`}>#{a.number}</Link> {a.title}
                              {(a.status === "DONE" && " ✓") || ""}
                            </li>
                          ))}
                        </ul>
                      )}
                      {problems.length > 0 && <div className="mt-1 text-amber-800">{problems[0]}</div>}
                    </td>
                    <td className="text-xs whitespace-nowrap">{formatDate(f.dueDate)}</td>
                    <td>
                      <Badge className={f.status === "OPEN" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}>
                        {f.status === "OPEN" ? "Open" : "Afgehandeld"}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-neutral-500">
        CM = corrigerende maatregel (neemt de oorzaak weg). Bij een major of minor zijn een oorzaakanalyse en minstens één corrigerende maatregel nodig; de
        bevinding handel je af bij de audit.
      </p>
    </>
  );
}
