import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { EMISSION_TYPE_LABEL } from "@/lib/co2";
import { latestDataYear, loadInventory, loadProgress } from "@/lib/co2-data";
import { loadPlanData } from "@/lib/co2-plan-data";
import { emissionSummary, fuelSummary, getReportTexts, majorEnergyStreams, pipeTable } from "@/lib/co2-report";
import { Chapter, Empty, Invalshoek, PdcaFigure, Rich, Section } from "./report-blocks";
import { PageHeader } from "@/components/ui";
import { ChartCard } from "@/components/charts";
import { Co2Nav } from "@/components/co2-nav";
import { FleetFigure, FuelPerYear, GroupDonut } from "@/components/co2-charts";

export const metadata = { title: "CO2-jaarverslag" };

const t2 = (kg: number) => (kg / 1000).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const t1 = (kg: number) => (kg / 1000).toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const gj = (v: number) => v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pc = (v: number, d = 1) => `${(Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toLocaleString("nl-NL", { minimumFractionDigits: d, maximumFractionDigits: d })}%`;

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ jaar?: string }> }) {
  const user = await requireUser();
  const canEdit = can(user.role, "co2.manage");
  const sp = await searchParams;
  const year = Number(sp.jaar) >= 2000 && Number(sp.jaar) <= 2100 ? Number(sp.jaar) : await latestDataYear();
  const first = await prisma.energyConsumption.findFirst({ orderBy: { periodStart: "asc" }, select: { periodStart: true } });
  const firstYear = Math.max(first?.periodStart.getUTCFullYear() ?? year, year - 5);
  const [inv, progress, plan, texts, fleetManual, fleetVehicles] = await Promise.all([
    loadInventory(year),
    loadProgress(firstYear, year),
    loadPlanData(),
    getReportTexts(),
    prisma.fleetCount.findMany(),
    prisma.equipment.findMany({
      where: { vehicleType: { not: null } },
      select: { vehicleType: true, fuelType: true, euroClass: true, inServiceFrom: true, inServiceUntil: true, active: true },
    }),
  ]);
  const years = progress.map((p) => p.year);
  const fuel = fuelSummary(
    progress.map((p) => ({ year: p.year, lines: p.lines })),
    year,
  );
  const totals = progress.map((p) => ({ year: p.year, kg: p.totalKg, scope1: p.byScope[1], scope2: p.byScope[2], bt: p.byScope[3] }));
  const emission = emissionSummary(totals, year);
  const energyByGroup = new Map<string, number>();
  for (const l of inv.lines) energyByGroup.set(l.group, (energyByGroup.get(l.group) ?? 0) + (l.gj ?? 0));
  const by = (s: 1 | 2 | 3) => inv.lines.filter((l) => l.scope === s);
  const perFte = inv.fte ? inv.totalKg / 1000 / inv.fte : null;
  const { calc, pva, target, baseYear, targetYear, measures } = plan;
  const topMeasures = [...calc.measures]
    .filter((m) => m.kg > 0)
    .sort((a, b) => b.kg - a.kg)
    .slice(0, 5)
    .map((m) => ({ r: m, a: measures.find((x) => x.id === m.id)! }));
  const streams = new Map<string, { name: string; scope: 1 | 2 | 3; unit: string }>();
  for (const y of progress) for (const l of y.lines) streams.set(`${l.carrierId}|${l.scope}`, { name: l.name, scope: l.scope, unit: l.unit });
  const rows = [...streams.entries()].sort((a, b) => a[1].scope - b[1].scope || a[1].name.localeCompare(b[1].name, "nl"));
  const valOf = (y: (typeof progress)[number], k: string, f: "kg" | "gj") => {
    const l = y.lines.find((x) => `${x.carrierId}|${x.scope}` === k);
    return l ? (f === "kg" ? l.kg : (l.gj ?? 0)) : 0;
  };
  const scopePct = (s: 1 | 2) => calc.scopes.find((x) => x.scope === s)!.totalPct;
  const energyPct = pva.target?.totalGjPct ?? calc.energyTotalPct;
  const majorStreams = majorEnergyStreams(inv.lines.filter((l) => l.gj !== null).map((l) => ({ name: l.name, gj: l.gj! })));

  const ScopeTable = ({ s, title }: { s: 1 | 2 | 3; title: string }) => (
    <table className="table mb-3" data-export-name={title}>
      <thead>
        <tr>
          <th>{title}</th>
          <th className="text-right">Aantal</th>
          <th>Eenheid</th>
          <th className="text-right">Factor (g CO2/eenheid)</th>
          <th className="text-right">Uitstoot (t CO2)</th>
          <th className="text-right">Aandeel</th>
        </tr>
      </thead>
      <tbody>
        {by(s).map((l) => (
          <tr key={l.carrierId}>
            <td>{l.name}</td>
            <td className="text-right tabular-nums">{l.quantity.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}</td>
            <td>{l.unit}</td>
            <td className="text-right tabular-nums">{l.factorKg === null ? "—" : (Math.round(l.factorKg * 1000) || 0).toLocaleString("nl-NL")}</td>
            <td className="text-right tabular-nums">{t1(l.kg)}</td>
            <td className="text-right tabular-nums">{inv.totalKg ? pc((l.kg / inv.totalKg) * 100, 0) : "—"}</td>
          </tr>
        ))}
        <tr className="bg-neutral-50 font-semibold">
          <td colSpan={4} className="text-right">
            Totaal {title.toLowerCase()}
          </td>
          <td className="text-right tabular-nums">{t1(inv.byScope[s])}</td>
          <td className="text-right tabular-nums">{inv.totalKg ? pc((inv.byScope[s] / inv.totalKg) * 100, 0) : "—"}</td>
        </tr>
      </tbody>
    </table>
  );

  return (
    <>
      <span hidden data-export-title={`CO2-jaarverslag ${year}`} />
      <PageHeader
        title="CO2-prestatieladder"
        description={`CO2-jaarverslag ${year}, opgebouwd zoals het jaarverslag voor de CO2-prestatieladder: cijfers, tabellen en grafieken uit het IMS, aangevuld met de vaste teksten. Afdrukken als PDF of downloaden als Word.`}
      />
      <Co2Nav />

      <form className="mb-4 flex flex-wrap items-end gap-2 print:hidden">
        <label className="block">
          <span className="label">Verslagjaar</span>
          <select name="jaar" defaultValue={year} className="input">
            {Array.from({ length: 8 }, (_, i) => new Date().getUTCFullYear() - i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-secondary">Tonen</button>
        {canEdit && (
          <Link href="/co2/rapportage/teksten" className="btn-secondary">
            Teksten van het verslag invullen
          </Link>
        )}
      </form>

      {/* Voorblad */}
      <section className="relative mb-6 overflow-hidden rounded-2xl border border-neutral-200 bg-white px-8 py-10 print:flex print:min-h-[180mm] print:flex-col print:justify-center">
        <div className="absolute -top-16 -right-16 size-64 rounded-full bg-brand-red/10" aria-hidden />
        <div className="absolute right-28 -bottom-20 size-44 rounded-full bg-brand-grey-light/50" aria-hidden />
        <div className="absolute top-0 left-0 h-full w-1.5 bg-brand-red" aria-hidden />
        <div className="relative">
          <div className="inline-block rounded-full bg-brand-red px-3 py-1 text-xs font-semibold tracking-widest text-white uppercase">
            CO2-prestatieladder · trede 1
          </div>
          <h2 className="mt-4 text-4xl font-bold text-neutral-900">CO2-jaarverslag {year}</h2>
          <p className="mt-1 text-xl text-brand-red-dark">Rouwmaat Groep</p>
          {texts.publication && <p className="mt-1 text-sm text-neutral-500">{texts.publication}</p>}
          <div className="mt-8 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              [t1(inv.totalKg), "t CO2 totaal"],
              [t1(inv.byScope[1]), "t CO2 scope 1"],
              [t1(inv.byScope[2]), "t CO2 scope 2"],
              [perFte === null ? "—" : perFte.toLocaleString("nl-NL", { maximumFractionDigits: 2 }), "t CO2 per FTE"],
            ].map(([v, l], i) => (
              <div key={l} className={`rounded-lg border-l-4 bg-neutral-50 px-3 py-2 ${i === 0 ? "border-brand-red" : "border-brand-grey-dark"}`}>
                <div className={`text-2xl font-bold tabular-nums ${i === 0 ? "text-brand-red-dark" : "text-neutral-900"}`}>{v}</div>
                <div className="text-xs text-neutral-500">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <nav className="card mb-6 text-sm print:hidden" aria-label="Inhoud">
        <div className="mb-2 font-semibold">Inhoud</div>
        <ol className="grid gap-1 sm:grid-cols-2">
          {[
            ["#leeswijzer", "Leeswijzer"],
            ["#statement", "Management statement & energiebeleid"],
            ["#organisatie", "Algemene eisen: organisatie, planning, wetgeving en risico's"],
            ["#a", "Invalshoek A — CO2-uitstoot en energieverbruik"],
            ["#energiebeoordeling", "Energiebeoordeling, conclusies en flexibiliteit"],
            ["#b", "Invalshoek B — Doelstellingen, plan van aanpak en voortgang"],
            ["#c", "Invalshoek C — Sleutelpersonen en communicatie"],
            ["#d", "Invalshoek D — Samenwerking"],
          ].map(([href, label]) => (
            <li key={href}>
              <a href={href}>{label}</a>
            </li>
          ))}
        </ol>
      </nav>

      <Chapter id="leeswijzer" title="Leeswijzer" newPage={false} />
      <Section>
        <Rich value={texts.readingGuide} empty="Nog geen leeswijzer (opbouw van het verslag en de ondersteunende documenten)." canEdit={canEdit} />
      </Section>

      <Chapter id="statement" title="Management statement & energiebeleid" />
      <Section>
        <Rich
          value={texts.statement}
          empty="Nog geen managementstatement en energiebeleid."
          canEdit={canEdit}
          className="lg:columns-2 lg:gap-8 [&>*]:break-inside-avoid"
        />
        {(texts.statementName || texts.statementDate) && (
          <table className="mt-5 w-full max-w-xl text-sm">
            <tbody>
              <tr className="text-xs text-neutral-500 uppercase">
                <td className="pr-4">Datum</td>
                <td className="pr-4">Naam</td>
                <td>Handtekening</td>
              </tr>
              <tr className="font-medium">
                <td className="pr-4 pt-1">{texts.statementDate}</td>
                <td className="pr-4 pt-1">{texts.statementName}</td>
                <td className="border-b border-neutral-400 pt-1" />
              </tr>
            </tbody>
          </table>
        )}
      </Section>

      <Chapter id="organisatie" kicker="Algemene eisen" title="Organisatie" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Organisatiebeschrijving">
          <Rich value={texts.organisation} empty="Nog geen beschrijving van de organisatie." canEdit={canEdit} />
        </Section>
        <Section title="Organisatiegrens">
          <Rich value={texts.boundary} empty="Nog geen beschrijving van de organisatiegrens en de entiteiten." canEdit={canEdit} />
        </Section>
      </div>
      <Section title="Planning" className="break-inside-avoid-page">
        <Rich value={texts.planning} empty="Beschrijf hoe het energie- en CO2-managementsysteem volgens de PDCA-cyclus werkt." canEdit={canEdit} />
        {(texts.pdcaPlan || texts.pdcaDo || texts.pdcaCheck || texts.pdcaAct || texts.planning) && (
          <PdcaFigure plan={texts.pdcaPlan} doText={texts.pdcaDo} check={texts.pdcaCheck} act={texts.pdcaAct} />
        )}
      </Section>
      <Section title="Wetgeving en risicobeheer">
        <Rich
          value={texts.legalRisk}
          empty="Beschrijf hoe wet- en regelgeving en risico's en kansen voor het CO2-managementsysteem worden bewaakt."
          canEdit={canEdit}
        />
        <p className="mt-2 text-xs text-neutral-500 print:hidden">
          In het IMS: <Link href="/wetgeving">wet- en regelgeving</Link> · <Link href="/risicos">risico&apos;s en kansen</Link>
        </p>
      </Section>
      <Section title="CO2-prestatieladder projecten">
        <Rich value={texts.projects} empty="Geef aan of er in het verslagjaar projecten met gunningvoordeel liepen." canEdit={canEdit} />
      </Section>

      <Invalshoek id="a" letter="A" title="Waar staan we nu?" subtitle="CO2-uitstoot en energieverbruik" />
      <Section title={`CO2-footprint scope 1 & 2 — ${year}`}>
        {texts.footprintText ? (
          <Rich value={texts.footprintText} className="mb-3" />
        ) : (
          <p className="mb-3 text-sm text-neutral-700">
            De CO2-footprint is opgesteld conform het GHG-protocol, met {EMISSION_TYPE_LABEL[inv.type].toLowerCase()}-emissiefactoren. {emission.join(" ")}
          </p>
        )}
        <div className="overflow-x-auto">
          <ScopeTable s={1} title="Scope 1" />
          <ScopeTable s={2} title="Scope 2 (market based)" />
          {by(3).length > 0 && <ScopeTable s={3} title="Zakelijk reizen (business travel)" />}
        </div>
        <p className="text-sm font-semibold">Totale emissies scope 1, 2 en zakelijk reizen: {t2(inv.totalKg)} t CO2</p>
        {inv.locationBased && (
          <div className="mt-3 overflow-x-auto">
            <table className="table" data-export-name="Location based">
              <thead>
                <tr>
                  <th>Scope 2 (location based)</th>
                  <th className="text-right">Aantal</th>
                  <th>Eenheid</th>
                  <th className="text-right">Factor (g CO2/eenheid)</th>
                  <th className="text-right">Uitstoot (t CO2)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Elektriciteitsverbruik - gridmix (NL)</td>
                  <td className="text-right tabular-nums">{Math.round(inv.locationBased.kwh).toLocaleString("nl-NL")}</td>
                  <td>kWh</td>
                  <td className="text-right tabular-nums">{inv.locationBased.factorKg === null ? "—" : Math.round(inv.locationBased.factorKg * 1000)}</td>
                  <td className="text-right tabular-nums">{inv.locationBased.kg === null ? "—" : t1(inv.locationBased.kg)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Section>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={`CO2-footprint scope 1 & 2 — ${year}`} subtitle="t CO2 per groep, heel jaar">
          <GroupDonut items={inv.groups.map((g) => ({ group: g.group, value: g.kg / 1000 }))} unit=" t" centerLabel="t CO2" decimals={1} />
        </ChartCard>
        <ChartCard title={`Figuur M2. Energiebalans — ${year}`} subtitle="GJ per groep, heel jaar">
          <GroupDonut items={[...energyByGroup.entries()].map(([group, value]) => ({ group, value }))} unit=" GJ" centerLabel="GJ" />
        </ChartCard>
      </div>
      <Section title="Energiebalans">
        <div className="overflow-x-auto">
          <table className="table" data-export-name="Energiebalans">
            <thead>
              <tr>
                <th>Emissiestroom</th>
                <th className="text-right">Aantal</th>
                <th>Eenheid</th>
                <th className="text-right">GJ per eenheid</th>
                <th className="text-right">GJ</th>
                <th className="text-right">Aandeel</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines
                .filter((l) => l.gj !== null)
                .map((l) => (
                  <tr key={`${l.carrierId}${l.scope}`}>
                    <td>{l.name}</td>
                    <td className="text-right tabular-nums">{l.quantity.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}</td>
                    <td>{l.unit}</td>
                    <td className="text-right tabular-nums">{l.quantity ? (l.gj! / l.quantity).toLocaleString("nl-NL", { maximumFractionDigits: 5 }) : "—"}</td>
                    <td className="text-right tabular-nums">{gj(l.gj!)}</td>
                    <td className="text-right tabular-nums">{inv.energyTotalGJ ? pc((l.gj! / inv.energyTotalGJ) * 100, 0) : "—"}</td>
                  </tr>
                ))}
              <tr className="bg-neutral-50 font-semibold">
                <td colSpan={4} className="text-right">
                  Totaal energieverbruik
                </td>
                <td className="text-right tabular-nums">{gj(inv.energyTotalGJ)}</td>
                <td className="text-right">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="Niet-CO2-broeikasgassen">
        <Rich value={texts.nonCo2} empty="Geef aan of er niet-CO2-broeikasgassen (bijv. koelgassen) in de organisatie zijn." canEdit={canEdit} />
      </Section>

      <Chapter id="energiebeoordeling" kicker="Invalshoek A" title="Energiebeoordeling" />
      <Section>
        <Rich value={texts.energyReview} empty="Licht toe hoe is onderzocht waar de meeste energie wordt verbruikt." canEdit={canEdit} />
        <p className="mt-3 mb-2 text-sm font-medium">Emissiestromen die in {year} samen verantwoordelijk zijn voor ten minste 80% van het energieverbruik:</p>
        {majorStreams.length ? (
          <ol className="space-y-1.5">
            {majorStreams.map((m, i) => (
              <li key={m.name} className="flex items-center gap-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-red text-xs font-bold text-white">{i + 1}</span>
                <span className="flex-1 font-medium">{m.name}</span>
                <span className="tabular-nums">{gj(m.gj)} GJ</span>
                <span className="w-24 text-right text-neutral-500 tabular-nums">
                  {pc(m.pct)} (cum. {pc(m.cumPct, 0)})
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-neutral-500">Nog geen energieverbruik in GJ.</p>
        )}
      </Section>
      <Section title="Brandstofgebruik">
        {texts.fuelText ? (
          <Rich value={texts.fuelText} className="mb-3" />
        ) : (
          <p className="mb-3 text-sm leading-relaxed text-neutral-800">{fuel.sentences.join(" ") || "Nog geen brandstofverbruik in liters."}</p>
        )}
        <ChartCard title="Brandstofverbruik per jaar" subtitle="liter per energiedrager" className="border-0 p-0 shadow-none">
          <FuelPerYear perYear={fuel.perYear} carriers={fuel.carriers} />
        </ChartCard>
      </Section>
      <Section title="Vrachtwagenpark" className="break-inside-avoid-page">
        <Rich value={texts.truckText} empty="Beschrijf de ontwikkeling van het vrachtwagenpark (brandstof, Euroklasse)." canEdit={canEdit} className="mb-4" />
        <ChartCard
          title="Figuur V1. Overzicht milieuclassificaties per jaar"
          subtitle="Aantal vrachtwagens per Euroklasse"
          className="border-0 p-0 shadow-none"
        >
          <FleetFigure kind="EURO" manual={fleetManual} vehicles={fleetVehicles} vehicleType="TRUCK" />
        </ChartCard>
      </Section>
      <Section title="Wagenpark" className="break-inside-avoid-page">
        <Rich value={texts.fleetText} empty="Beschrijf de samenstelling en ontwikkeling van het wagenpark." canEdit={canEdit} className="mb-4" />
        <ChartCard title="Figuur V3. Brandstoftypes wagenpark" subtitle="Aantal voertuigen per brandstoftype" className="border-0 p-0 shadow-none">
          <FleetFigure kind="FUEL" manual={fleetManual} vehicles={fleetVehicles} />
        </ChartCard>
      </Section>
      <Section title="Conclusies, aanbevelingen en genomen maatregelen" className="print:break-before-page">
        <Rich value={texts.conclusions} empty="Nog geen conclusies en aanbevelingen." canEdit={canEdit} />
      </Section>
      <Section title="Flexibiliteit van het energiesysteem">
        <Rich
          value={texts.flexibility}
          empty="Beschrijf hoe de organisatie bijdraagt aan een flexibel energiesysteem (netcongestie, slim laden)."
          canEdit={canEdit}
        />
      </Section>

      <Invalshoek id="b" letter="B" title="Van inzicht naar reductie" subtitle="Onze doelstellingen en actieplan" />
      <Section title="Algemene uitleg strategie">
        <Rich value={texts.strategy} empty="Beschrijf de strategie om de CO2-uitstoot te verminderen." canEdit={canEdit} />
      </Section>
      <Section title="Korte termijn CO2-doelstellingen" className="break-inside-avoid-page">
        <Rich value={texts.co2TargetText} className="mb-3" />
        <p className="mb-3 rounded-lg border-l-4 border-brand-red bg-neutral-50 px-4 py-3 text-base font-semibold text-neutral-900 italic">
          {pva.target?.text12 ?? pva.target?.textAll ?? target?.description ?? target?.title ?? "Nog geen doelstelling."}
        </p>
        <table className="table max-w-2xl">
          <thead>
            <tr>
              <th colSpan={2}>Subdoelstellingen CO2</th>
            </tr>
          </thead>
          <tbody>
            {([1, 2] as const).map((s) => (
              <tr key={s}>
                <td className="w-28 font-medium">Scope {s}</td>
                <td>
                  {pc(scopePct(s))} reductie in {targetYear} vergeleken met {baseYear}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Korte termijn energiedoelstellingen" className="break-inside-avoid-page">
        <Rich value={texts.energyTargetText} className="mb-3" />
        <p className="mb-3 rounded-lg border-l-4 border-brand-red bg-neutral-50 px-4 py-3 text-base font-semibold text-neutral-900 italic">
          Rouwmaat Groep wil in {targetYear} het energieverbruik met {pc(energyPct, 0)} verminderen ten opzichte van {baseYear}.
        </p>
        {pipeTable(texts.energyGoals).length ? (
          <table className="table max-w-2xl">
            <thead>
              <tr>
                <th colSpan={2}>Subdoelstellingen energie</th>
              </tr>
            </thead>
            <tbody>
              {pipeTable(texts.energyGoals).map((r, i) => (
                <tr key={i} className="align-top">
                  <td className="w-44 font-medium">{r[0]}</td>
                  <td>{r.slice(1).join(" ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty text="Vul de subdoelstellingen energie in (zelf opwekken, opslag, duurzame energie)." canEdit={canEdit} />
        )}
      </Section>
      <Section title="Korte termijn strategie">
        <Rich value={texts.shortTermStrategy} empty="Beschrijf de korte termijn strategie (laaghangend fruit, grootste emissiestromen)." canEdit={canEdit} />
      </Section>
      <Section title="Plan van aanpak" className="break-inside-avoid-page">
        {texts.planText ? (
          <Rich value={texts.planText} />
        ) : topMeasures.length ? (
          <ol className="space-y-2">
            {topMeasures.map(({ r, a }, i) => (
              <li key={r.id} className="flex gap-3 rounded-lg border border-neutral-200 p-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-red text-sm font-bold text-white">{i + 1}</span>
                <div className="min-w-0">
                  <div className="font-semibold">
                    <Link href={`/co2/plan/${a.id}`}>{a.title}</Link>
                    <span className="ml-2 text-sm font-normal text-neutral-500">
                      −{t1(r.kg)} t CO2 ({pc(r.totalPct, 2)} van het totaal)
                    </span>
                  </div>
                  {a.description && <p className="text-sm text-neutral-700">{a.description}</p>}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-neutral-500">Nog geen maatregelen met een reductiepercentage.</p>
        )}
        <p className="mt-2 text-xs text-neutral-500 print:hidden">
          Alle maatregelen: <Link href="/co2/plan">plan van aanpak</Link> · berekening: <Link href="/co2/plan/berekening">berekening doelstelling</Link>
        </p>
      </Section>
      <Section title="Verantwoording doelstellingen">
        <Rich
          value={texts.justification}
          empty="Licht toe waarom de doelstelling ambitieus en realistisch is (sectorgenoten, Trias Energetica)."
          canEdit={canEdit}
        />
      </Section>

      <Section title="Voortgang op de doelstellingen — scope 1 en 2" className="print:break-before-page">
        {texts.progressText ? (
          <Rich value={texts.progressText} className="mb-3" />
        ) : (
          <p className="mb-3 text-sm text-neutral-700">
            {emission.join(" ")}
            {year === baseYear &&
              ` ${year} is het basisjaar voor de huidige reductiedoelstelling; de voortgang ten opzichte van de doelstelling is vanaf verslagjaar ${year + 1} zichtbaar.`}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="table" data-export-name="Voortgang CO2">
            <thead>
              <tr>
                <th>Emissiestroom (t CO2)</th>
                {years.map((y) => (
                  <th key={y} className="text-right">
                    {y}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {([1, 2, 3] as const).map((sc) => {
                const list = rows.filter(([, s]) => s.scope === sc);
                if (!list.length) return null;
                return [
                  ...list.map(([k, s]) => (
                    <tr key={k}>
                      <td>{s.name}</td>
                      {progress.map((p) => (
                        <td key={p.year} className="text-right tabular-nums">
                          {valOf(p, k, "kg") ? t2(valOf(p, k, "kg")) : "—"}
                        </td>
                      ))}
                    </tr>
                  )),
                  <tr key={`t${sc}`} className="bg-neutral-50 font-medium">
                    <td className="text-right">Totaal {sc === 3 ? "zakelijk reizen" : `scope ${sc}`}</td>
                    {progress.map((p) => (
                      <td key={p.year} className="text-right tabular-nums">
                        {t2(p.byScope[sc])}
                      </td>
                    ))}
                  </tr>,
                ];
              })}
              <tr className="bg-neutral-100 font-semibold">
                <td>Totale emissies</td>
                {progress.map((p) => (
                  <td key={p.year} className="text-right tabular-nums">
                    {t2(p.totalKg)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="Voortgang energiedoelstelling">
        <div className="overflow-x-auto">
          <table className="table" data-export-name="Voortgang energie">
            <thead>
              <tr>
                <th>Emissiestroom (GJ)</th>
                {years.map((y) => (
                  <th key={y} className="text-right">
                    {y}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows
                .filter(([k]) => progress.some((p) => valOf(p, k, "gj")))
                .map(([k, s]) => (
                  <tr key={k}>
                    <td>{s.name}</td>
                    {progress.map((p) => (
                      <td key={p.year} className="text-right tabular-nums">
                        {valOf(p, k, "gj") ? gj(valOf(p, k, "gj")) : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              <tr className="bg-neutral-100 font-semibold">
                <td>Totaal energieverbruik</td>
                {progress.map((p) => (
                  <td key={p.year} className="text-right tabular-nums">
                    {gj(p.energyTotalGJ)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <Rich value={texts.energyProgressText} className="mt-3" />
      </Section>
      <Section title="Vergelijking met sectorgenoten" className="print:break-before-page">
        <Rich value={texts.peersIntro} className="mb-3" />
        <Rich value={texts.peers} empty="Vul de vergelijking met sectorgenoten in." canEdit={canEdit} />
        <Rich value={texts.peersText} className="mt-3" />
      </Section>

      <Invalshoek id="c" letter="C" title="CO2-bewustwording" subtitle="Binnen en buiten de organisatie" />
      <Section title="Sleutelpersonen">
        <Rich value={texts.keyPersonsIntro} className="mb-3" />
        <Rich value={texts.keyPersons} empty="Vul de sleutelpersonen in." canEdit={canEdit} />
        {texts.support && (
          <div className="mt-4 rounded-lg border-l-4 border-brand-red bg-neutral-50 px-4 py-3">
            <div className="mb-1 text-sm font-semibold text-brand-red-dark">Ondersteuning</div>
            <Rich value={texts.support} />
          </div>
        )}
      </Section>
      <Section title="Communicatieplan" className="print:break-before-page">
        <Rich value={texts.communication} empty="Beschrijf hoe de interne en externe communicatie is geregeld." canEdit={canEdit} />
        {texts.channels && (
          <>
            <h4 className="mt-4 mb-2 font-semibold">Middelen</h4>
            <Rich value={texts.channels} />
          </>
        )}
        {texts.audienceExternal && (
          <>
            <h4 className="mt-4 mb-2 font-semibold">Externe doelgroep</h4>
            <Rich value={texts.audienceExternal} />
          </>
        )}
        {texts.audienceInternal && (
          <>
            <h4 className="mt-4 mb-2 font-semibold">Interne doelgroep</h4>
            <Rich value={texts.audienceInternal} />
          </>
        )}
      </Section>
      <Section title="Verantwoordelijke en planning">
        <Rich value={texts.commPlanning} empty="Vul per communicatiemiddel de planning en de verantwoordelijke in." canEdit={canEdit} />
      </Section>

      <Invalshoek id="d" letter="D" title="Samenwerking" subtitle="Inventarisatie kennis- en samenwerkingsbehoeftes" />
      <Section title="Inventarisatie kennis- en samenwerkingsbehoeftes">
        <Rich value={texts.collaboration} empty="Beschrijf de kennis- en samenwerkingsbehoeftes." canEdit={canEdit} />
      </Section>
      <Section title="Samenwerkingsverbanden">
        {pipeTable(texts.partners).length ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {pipeTable(texts.partners).map((r, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg border-l-4 border-brand-red bg-neutral-50 px-3 py-2 text-sm font-medium">
                {r.join(" — ")}
              </li>
            ))}
          </ul>
        ) : (
          <Empty text="Vul de samenwerkingsverbanden in (één per regel)." canEdit={canEdit} />
        )}
        <Rich value={texts.partnersText} className="mt-4" />
      </Section>

      <section className="mt-10 rounded-2xl border border-neutral-200 bg-white px-8 py-12 text-center print:break-before-page">
        <div className="mx-auto mb-4 h-1 w-16 rounded bg-brand-red" aria-hidden />
        <h2 className="text-3xl font-bold text-neutral-900">Bedankt voor het lezen</h2>
        <Rich value={texts.closing} className="mx-auto mt-3 max-w-xl text-base" />
        <p className="mt-6 text-xs text-neutral-500">
          Rouwmaat Groep · CO2-jaarverslag {year} · cijfers uit het IMS ({EMISSION_TYPE_LABEL[inv.type]}), stand{" "}
          {new Date().toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam" })}
        </p>
      </section>
    </>
  );
}
