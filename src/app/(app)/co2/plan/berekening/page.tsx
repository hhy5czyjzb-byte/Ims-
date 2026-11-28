import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { EMISSION_TYPE_LABEL } from "@/lib/co2";
import { yearlyTotals } from "@/lib/co2-data";
import { milestonePct } from "@/lib/co2-plan";
import { loadPlanData } from "@/lib/co2-plan-data";
import { PageHeader } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { Co2Nav } from "@/components/co2-nav";
import { PlanTabs } from "../plan-tabs";
import { syncScopeTargets } from "../actions";

export const metadata = { title: "Berekening doelstelling" };

const pc = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined ? "—" : `${v.toLocaleString("nl-NL", { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
const t1 = (kg: number) => (kg / 1000).toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const gj0 = (gj: number) => gj.toLocaleString("nl-NL", { maximumFractionDigits: 0 });

/** Wat de maatregelen per emissiestroom verminderen (kop zoals in het dashboard). */
const STREAM_TITLE: Record<string, string> = {
  "Scope 1 - Aardgasverbruik": "Maatregelen aardgasverbruik",
  "Scope 1 - Brandstofverbruik": "Maatregelen brandstofverbruik",
  "Scope 2 - Elektriciteitsverbruik": "Maatregelen elektriciteitsverbruik",
  "Scope 2 - Warmteverbruik": "Maatregelen warmteverbruik",
  "Zakelijk reizen": "Maatregelen zakelijk reizen",
  "Scope 3": "Maatregelen scope 3",
};
const STREAM_UNIT: Record<string, string> = {
  "Scope 1 - Aardgasverbruik": "m3",
  "Scope 1 - Brandstofverbruik": "liter/kWh",
  "Scope 2 - Elektriciteitsverbruik": "kWh",
  "Scope 2 - Warmteverbruik": "GJ",
};

export default async function CalculationPage() {
  const user = await requireUser();
  const canEdit = can(user.role, "co2.manage");
  const d = await loadPlanData();
  const { calc, baseYear, targetYear, pva, target, scopeTargets, measures, inv, groups } = d;
  const pt = pva.target;
  const now = new Date().getUTCFullYear();
  const realized = await yearlyTotals(baseYear, Math.min(Math.max(targetYear, baseYear), now - 1));
  const baseKg = realized.find((r) => r.year === baseYear)?.kg ?? inv.totalKg;
  const scope = (s: 1 | 2 | 3) => calc.scopes.find((x) => x.scope === s)!;
  const fixed = (s: 1 | 2 | 3) => scopeTargets.find((t) => t.scope === s);
  const mainPct = target ? Number(target.reductionPct) : (pt?.totalCo2Pct ?? calc.totalPct);
  const years = Array.from({ length: Math.max(1, targetYear - baseYear + 3) }, (_, i) => baseYear + i);
  const ms = (y: number) => pt?.milestones.find((m) => m.year === y);
  const scopePct = (s: 1 | 2) => (fixed(s) ? Number(fixed(s)!.reductionPct) : scope(s).potentialPct);
  const label = (id: string) => measures.find((m) => m.id === id);

  return (
    <>
      <PageHeader
        title="CO2-prestatieladder"
        description="CO2-reductiedoelstelling berekening — zoals het tabblad 'PVA - berekening doelstelling' in het CO2-dashboard. Per maatregel het reductiepercentage op de emissiestroom; de app rekent de reductie op het totaal, per scope en op energie uit. Uitstoot en energie uit de emissie-inventaris van het basisjaar."
      />
      <Co2Nav />
      <PlanTabs />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-2">CO2-reductiedoelstelling berekening</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            <dt className="text-neutral-500">Organisatie</dt>
            <dd>{pt?.organisation ?? "Rouwmaat Groep"}</dd>
            <dt className="text-neutral-500">Laatst opgestelde doelstelling jaar</dt>
            <dd>{pt?.lastTargetYear ?? "—"}</dd>
            <dt className="text-neutral-500">Basisjaar</dt>
            <dd>{baseYear}</dd>
            <dt className="text-neutral-500">Doeljaar</dt>
            <dd>{targetYear}</dd>
            <dt className="text-neutral-500">Type uitstoot</dt>
            <dd>{EMISSION_TYPE_LABEL[inv.type]}</dd>
            <dt className="text-neutral-500">Uitstoot basisjaar</dt>
            <dd>
              {t1(inv.totalKg)} t CO2 · {gj0(inv.energyTotalGJ)} GJ
            </dd>
          </dl>
        </section>
        <section className="card">
          <h2 className="mb-2">CO2-doelstellingen</h2>
          <h3 className="text-sm font-semibold">Doelstelling scope 1, 2 &amp; 3</h3>
          <p className="mb-3 text-sm text-neutral-700">{pt?.textAll ?? target?.description ?? target?.title ?? "—"}</p>
          <h3 className="text-sm font-semibold">Doelstelling scope 1 &amp; 2</h3>
          <p className="text-sm text-neutral-700">{pt?.text12 ?? "—"}</p>
          {target && (
            <p className="mt-3 text-xs text-neutral-500">
              Vastgesteld in de app: <Link href={`/co2/doelstellingen/${target.id}`}>{target.title}</Link>
              {scopeTargets.map((t) => (
                <span key={t.id}>
                  {" · "}
                  <Link href={`/co2/doelstellingen/${t.id}`}>{t.title}</Link>
                </span>
              ))}
            </p>
          )}
        </section>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="card overflow-x-auto p-0">
          <table className="table" data-export-name="Reductiedoelstellingen">
            <thead>
              <tr>
                <th>Reductiedoelstellingen</th>
                <th className="text-right">Reductie op totaal (CO2)</th>
                <th className="text-right">Reductie op totaal (GJ)</th>
                <th className="text-right">Vastgesteld</th>
              </tr>
            </thead>
            <tbody>
              {([1, 2, 3] as const).map((s) => (
                <tr key={s}>
                  <td>{s === 3 ? "Scope 3 / zakelijk reizen" : `Scope ${s}`}</td>
                  <td className="text-right tabular-nums">{pc(scope(s).totalPct)}</td>
                  <td className="text-right tabular-nums">{s === 3 ? "n.v.t." : pc(scope(s).energyTotalPct)}</td>
                  <td className="text-right tabular-nums text-neutral-500">{fixed(s) ? `${pc(Number(fixed(s)!.reductionPct), 1)} op scope ${s}` : "—"}</td>
                </tr>
              ))}
              <tr className="bg-neutral-50 font-semibold">
                <td>Totaal</td>
                <td className="text-right tabular-nums">{pc(calc.totalPct)}</td>
                <td className="text-right tabular-nums">{pc(calc.energyTotalPct)}</td>
                <td className="text-right tabular-nums text-neutral-500">{target ? `${pc(Number(target.reductionPct), 1)} in ${target.targetYear}` : "—"}</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section className="card overflow-x-auto p-0">
          <table className="table" data-export-name="Reductiepotentieel per scope">
            <thead>
              <tr>
                <th>Reductiepotentieel per scope</th>
                <th className="text-right">Reductie op scope (CO2)</th>
                <th className="text-right">Reductie t.o.v. scope 1 &amp; 2</th>
                <th className="text-right">Reductie op scope (GJ)</th>
              </tr>
            </thead>
            <tbody>
              {([1, 2, 3] as const).map((s) => (
                <tr key={s}>
                  <td>{s === 3 ? "Scope 3 / zakelijk reizen" : `Scope ${s}`}</td>
                  <td className="text-right tabular-nums">{pc(scope(s).potentialPct)}</td>
                  <td className="text-right tabular-nums">{s === 3 ? "n.v.t." : pc(scope(s).totalPct)}</td>
                  <td className="text-right tabular-nums">{s === 3 ? "n.v.t." : pc(scope(s).potentialGjPct)}</td>
                </tr>
              ))}
              <tr className="bg-neutral-50 font-semibold">
                <td>Totaal</td>
                <td />
                <td className="text-right tabular-nums">{pc(calc.totalPct)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      <section className="card mb-6 overflow-x-auto p-0">
        <table className="table" data-export-name="Tussendoelstellingen">
          <thead>
            <tr>
              <th>Tussendoelstellingen</th>
              <th className="text-right">Scope 1</th>
              <th className="text-right">Scope 2</th>
              <th className="text-right">Scope 3</th>
              <th className="text-right">Totaal</th>
              <th className="text-right">Laatst opgestelde doelstelling</th>
              <th className="text-right">Energie</th>
              <th className="text-right">Gerealiseerd (totaal)</th>
            </tr>
          </thead>
          <tbody>
            {years.map((y) => {
              const m = ms(y);
              const real = realized.find((r) => r.year === y);
              const realPct = real && real.kg > 0 && baseKg > 0 && y > baseYear ? ((baseKg - real.kg) / baseKg) * 100 : null;
              const plan = mainPct !== null ? milestonePct(mainPct, baseYear, targetYear, y) : null;
              return (
                <tr key={y} className={y === targetYear ? "font-semibold" : ""}>
                  <td>
                    {y}
                    {y === baseYear && <span className="ml-1 text-xs font-normal text-neutral-500">basisjaar</span>}
                    {y === targetYear && <span className="ml-1 text-xs font-normal text-neutral-500">doeljaar</span>}
                  </td>
                  <td className="text-right tabular-nums">{pc(m?.scope1 ?? milestonePct(scopePct(1), baseYear, targetYear, y), 1)}</td>
                  <td className="text-right tabular-nums">{pc(m?.scope2 ?? milestonePct(scopePct(2), baseYear, targetYear, y), 1)}</td>
                  <td className="text-right tabular-nums text-neutral-400">{m?.scope3 !== undefined && m?.scope3 !== null ? pc(m.scope3, 1) : "n.v.t."}</td>
                  <td className="text-right tabular-nums">{pc(m?.total ?? plan, 1)}</td>
                  <td className="text-right tabular-nums text-neutral-500">{pc(m?.lastTarget ?? null, 1)}</td>
                  <td className="text-right tabular-nums">{pc(m?.energy ?? milestonePct(calc.energyTotalPct, baseYear, targetYear, y), 1)}</td>
                  <td
                    className={`text-right tabular-nums ${realPct === null ? "text-neutral-300" : plan !== null && realPct >= plan ? "text-green-700" : "text-brand-red"}`}
                  >
                    {realPct === null ? "—" : pc(realPct, 1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="px-4 pb-3 text-xs text-neutral-500">
          {pt?.milestones.length
            ? "Tussendoelstellingen zoals ingevuld in het CO2-dashboard."
            : `Lineair pad van 0 % in ${baseYear} naar de doelstelling in ${targetYear}.`}{" "}
          Gerealiseerd = reductie t.o.v. {baseYear} volgens de emissie-inventaris (alleen volledige jaren).
        </p>
      </section>

      {([1, 2, 3] as const).map((s) => {
        const gs = calc.groups.filter((g) => g.scope === s && (g.kg !== 0 || calc.measures.some((m) => m.group === g.group)));
        if (!gs.length) return null;
        return (
          <div key={s} className="mb-6">
            <h2 className="mb-2">{s === 3 ? "Zakelijk reizen / scope 3" : `Scope ${s}`}</h2>
            {gs.map((g) => {
              const list = calc.measures.filter((m) => m.group === g.group);
              const carriers = groups.find((x) => x.group === g.group)?.carriers ?? [];
              return (
                <div key={g.group} className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                  <section className="card overflow-x-auto p-0">
                    <table className="table" data-export-name={STREAM_TITLE[g.group] ?? g.group}>
                      <thead>
                        <tr>
                          <th>{STREAM_TITLE[g.group] ?? g.group}</th>
                          <th className="text-right">Reductie op emissiestroom{STREAM_UNIT[g.group] ? ` (${STREAM_UNIT[g.group]})` : ""}</th>
                          <th className="text-right">Reductie op totaal (CO2)</th>
                          <th className="text-right">Reductie op energie</th>
                          <th className="text-right">Reductie op totaal (GJ)</th>
                          <th className="text-right">Indicatie</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((m) => {
                          const a = label(m.id);
                          return (
                            <tr key={m.id}>
                              <td>
                                <Link href={`/co2/plan/${m.id}`}>{a?.title}</Link>
                              </td>
                              <td className="text-right tabular-nums">{pc(m.streamPct)}</td>
                              <td className="text-right tabular-nums">{pc(m.totalPct)}</td>
                              <td className="text-right tabular-nums">{pc(m.energyPct)}</td>
                              <td className="text-right tabular-nums">{pc(m.energyTotalPct)}</td>
                              <td className="text-right tabular-nums text-neutral-500">{a?.co2Measure?.indication ?? ""}</td>
                            </tr>
                          );
                        })}
                        {!list.length && (
                          <tr>
                            <td colSpan={6} className="text-neutral-400">
                              Geen maatregelen.
                            </td>
                          </tr>
                        )}
                        <tr className="bg-neutral-50 font-semibold">
                          <td>Totaal op {(STREAM_TITLE[g.group] ?? g.group).replace(/^Maatregelen /, "")}</td>
                          <td className="text-right tabular-nums">{pc(g.streamPct)}</td>
                          <td className="text-right tabular-nums">{pc(g.totalPct)}</td>
                          <td className="text-right tabular-nums">{pc(g.energyPct)}</td>
                          <td className="text-right tabular-nums">{pc(g.energyTotalPct)}</td>
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  </section>
                  <section className="card overflow-x-auto p-0">
                    <table className="table" data-export-name={`Emissiestroom ${g.group}`}>
                      <thead>
                        <tr>
                          <th>Emissiestroom {baseYear}</th>
                          <th className="text-right">t CO2</th>
                          <th className="text-right">GJ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {carriers.map((c) => (
                          <tr key={c.carrierId}>
                            <td>{c.name}</td>
                            <td className="text-right tabular-nums">{t1(c.kg)}</td>
                            <td className="text-right tabular-nums">{gj0(c.gj)}</td>
                          </tr>
                        ))}
                        <tr className="bg-neutral-50 font-semibold">
                          <td>Totaal</td>
                          <td className="text-right tabular-nums">{t1(g.kg)}</td>
                          <td className="text-right tabular-nums">{gj0(g.gj)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </section>
                </div>
              );
            })}
          </div>
        );
      })}

      {measures.some((m) => m.status === "CANCELLED") && <p className="mb-4 text-xs text-neutral-500">Vervallen maatregelen tellen niet mee.</p>}

      {canEdit && (
        <section className="card print:hidden">
          <h2 className="mb-1">Doelstelling per scope vastleggen</h2>
          <p className="mb-3 text-sm text-neutral-600">
            Zet de doelstellingen voor scope 1 en scope 2 ({baseYear} → {targetYear}) gelijk aan deze berekening: scope 1 {pc(scope(1).potentialPct, 1)}, scope
            2 {pc(scope(2).potentialPct, 1)}. Ze verschijnen bij Doelstellingen, met voortgang per scope. De hoofddoelstelling blijft{" "}
            {target ? pc(Number(target.reductionPct), 1) : "zoals ingesteld"}.
          </p>
          <Form action={syncScopeTargets}>
            <SubmitButton>Doelstellingen per scope bijwerken</SubmitButton>
          </Form>
        </section>
      )}
    </>
  );
}
