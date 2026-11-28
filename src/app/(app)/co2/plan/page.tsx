import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { formatDate } from "@/lib/format";
import { ACTION_STATUS_CLASS, ACTION_STATUS_LABEL } from "@/lib/labels";
import { STREAM_GROUPS, measureReduction, streamGroupOf } from "@/lib/co2";
import { getMainTarget, getMeasureLookups, loadInventory } from "@/lib/co2-data";
import { Badge, Disclosure, PageHeader } from "@/components/ui";
import { BarList, ChartCard } from "@/components/charts";
import { Co2Nav } from "@/components/co2-nav";
import { Co2MeasureForm } from "@/components/co2-measure-form";
import { createCo2Measure } from "./actions";

export const metadata = { title: "Plan van aanpak" };

const t1 = (kg: number) => (kg / 1000).toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const p1 = (v: number) => `${v.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

export default async function PlanPage() {
  const user = await requireUser();
  const canEdit = can(user.role, "co2.manage");
  const target = await getMainTarget();
  const now = new Date().getUTCFullYear();
  const baseYear = target?.baseYear ?? now - 1;
  const [inv, measures, lookups] = await Promise.all([
    loadInventory(baseYear),
    prisma.action.findMany({
      where: { source: "CO2_REDUCTION" },
      orderBy: { number: "asc" },
      include: { co2Measure: true, owner: { select: { name: true } } },
    }),
    canEdit ? getMeasureLookups() : Promise.resolve(null),
  ]);

  // Uitstoot per emissiestroom en per energiedrager in het basisjaar.
  const groupKg = new Map<string, number>();
  const carrierKg = new Map<string, number>();
  for (const l of inv.lines) {
    const g = streamGroupOf({ name: l.name, reportGroup: l.group, defaultScope: l.scope });
    groupKg.set(g, (groupKg.get(g) ?? 0) + l.kg);
    carrierKg.set(l.carrierId, (carrierKg.get(l.carrierId) ?? 0) + l.kg);
  }
  const rows = measures.map((m) => {
    const c = m.co2Measure;
    const group = c?.streamGroup && (STREAM_GROUPS as readonly string[]).includes(c.streamGroup) ? c.streamGroup : (c?.streamGroup ?? "Overig");
    const streamKg = c?.carrierId ? (carrierKg.get(c.carrierId) ?? 0) : (groupKg.get(group) ?? 0);
    const red = measureReduction({
      reductionPct: c?.reductionPct === null || c?.reductionPct === undefined ? null : Number(c.reductionPct),
      streamKg,
      totalKg: inv.totalKg,
    });
    return { m, c, group, red };
  });
  const groups = [...new Set([...STREAM_GROUPS.filter((g) => rows.some((r) => r.group === g)), ...rows.map((r) => r.group)])];
  const totalKg = rows.filter((r) => r.m.status !== "CANCELLED").reduce((n, r) => n + (r.red?.kg ?? 0), 0);
  const totalPct = inv.totalKg ? (totalKg / inv.totalKg) * 100 : 0;
  const targetPct = target ? Number(target.reductionPct) : null;

  return (
    <>
      <PageHeader
        title="CO2-prestatieladder"
        description={`Plan van aanpak (energiemanagement actieplan, eis 3.B): maatregelen per emissiestroom met de verwachte reductie t.o.v. basisjaar ${baseYear}. Elke maatregel is een actie in de actielijst.`}
      />
      <Co2Nav />

      <section className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          [`Uitstoot basisjaar ${baseYear}`, `${t1(inv.totalKg)} t`],
          ["Verwachte reductie maatregelen", `${t1(totalKg)} t`],
          ["Reductiepotentieel", p1(totalPct)],
          ["Doelstelling", targetPct === null ? "—" : `${p1(targetPct)} in ${target!.targetYear}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-neutral-200 bg-white px-3 py-2">
            <div
              className={`text-xl font-bold tabular-nums ${label === "Reductiepotentieel" && targetPct !== null ? (totalPct >= targetPct ? "text-green-700" : "text-amber-700") : ""}`}
            >
              {value}
            </div>
            <div className="text-xs text-neutral-500">{label}</div>
          </div>
        ))}
      </section>
      {targetPct !== null && totalPct < targetPct && (
        <p className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          De maatregelen dekken {p1(totalPct)} van het doel van {p1(targetPct)}. Vul de reductiepercentages aan of voeg maatregelen toe.
        </p>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Verwachte reductie per emissiestroom" subtitle="t CO2 per jaar">
          <BarList
            items={groups.map((g) => ({
              label: g,
              value: Math.round(rows.filter((r) => r.group === g && r.m.status !== "CANCELLED").reduce((n, r) => n + (r.red?.kg ?? 0), 0) / 1000),
            }))}
            unit=" t"
            empty="Nog geen reductiepercentages ingevuld."
          />
        </ChartCard>
        <ChartCard title={`Uitstoot per emissiestroom ${baseYear}`} subtitle="t CO2 (basis voor de berekening)">
          <BarList items={[...groupKg.entries()].map(([g, kg]) => ({ label: g, value: Math.round(kg / 1000) })).sort((a, b) => b.value - a.value)} unit=" t" />
        </ChartCard>
      </div>

      {groups.map((g) => {
        const list = rows.filter((r) => r.group === g);
        const sum = list.filter((r) => r.m.status !== "CANCELLED").reduce((n, r) => n + (r.red?.kg ?? 0), 0);
        return (
          <section key={g} className="card mb-4 overflow-x-auto p-0">
            <table className="table">
              <thead>
                <tr>
                  <th>{g}</th>
                  <th>SKAO / eigen</th>
                  <th>Termijn</th>
                  <th>Deadline</th>
                  <th>Verantwoordelijke</th>
                  <th className="text-right">Reductie op stroom</th>
                  <th className="text-right">Verwacht (t/jaar)</th>
                  <th className="text-right">Van totaal</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map(({ m, c, red }) => (
                  <tr key={m.id} className={m.status === "CANCELLED" ? "text-neutral-400 line-through" : ""}>
                    <td>
                      <Link href={`/co2/plan/${m.id}`} className="font-medium">
                        #{m.number} {m.title}
                      </Link>
                      {c?.progressNote && <div className="text-xs text-neutral-500">{c.progressNote.slice(0, 120)}</div>}
                    </td>
                    <td className="text-xs">
                      {c?.skao ?? "—"}
                      {c?.skaoCategory && ` (${c.skaoCategory})`}
                    </td>
                    <td className="text-xs">{c?.term ?? "—"}</td>
                    <td className="text-xs whitespace-nowrap">{m.deadline ? formatDate(m.deadline) : (c?.planning?.slice(0, 30) ?? "—")}</td>
                    <td className="text-xs">{m.owner?.name ?? m.ownerText ?? "—"}</td>
                    <td className="text-right tabular-nums">{c?.reductionPct !== null && c?.reductionPct !== undefined ? p1(Number(c.reductionPct)) : "—"}</td>
                    <td className="text-right tabular-nums">{red ? t1(red.kg) : "—"}</td>
                    <td className="text-right tabular-nums">{red ? p1(red.pctOfTotal) : "—"}</td>
                    <td>
                      <Badge className={ACTION_STATUS_CLASS[m.status]}>{ACTION_STATUS_LABEL[m.status]}</Badge>
                    </td>
                  </tr>
                ))}
                <tr className="bg-neutral-50 font-semibold">
                  <td colSpan={6} className="text-right">
                    Totaal {g} (uitstoot {baseYear}: {t1(groupKg.get(g) ?? 0)} t)
                  </td>
                  <td className="text-right tabular-nums">{t1(sum)}</td>
                  <td className="text-right tabular-nums">{p1(inv.totalKg ? (sum / inv.totalKg) * 100 : 0)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </section>
        );
      })}
      {measures.length === 0 && <p className="mb-4 text-sm text-neutral-500">Nog geen maatregelen. Voeg ze toe of lees het plan van aanpak in via Inlezen.</p>}

      {canEdit && lookups && (
        <section className="card mt-6 print:hidden">
          <Disclosure summary="Maatregel toevoegen">
            <div className="mt-3">
              <Co2MeasureForm formAction={createCo2Measure} lookups={lookups} submitLabel="Maatregel opslaan" />
            </div>
          </Disclosure>
        </section>
      )}
    </>
  );
}
