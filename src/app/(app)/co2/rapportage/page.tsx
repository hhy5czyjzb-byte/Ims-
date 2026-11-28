import Link from "next/link";
import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { EMISSION_TYPE_LABEL } from "@/lib/co2";
import { latestDataYear, loadInventory, loadProgress } from "@/lib/co2-data";
import { loadPlanData } from "@/lib/co2-plan-data";
import { emissionSummary, fuelSummary, getReportTexts, pipeTable } from "@/lib/co2-report";
import { PageHeader } from "@/components/ui";
import { ChartCard } from "@/components/charts";
import { Co2Nav } from "@/components/co2-nav";
import { FleetFigure, FuelPerYear, GroupDonut } from "@/components/co2-charts";

export const metadata = { title: "CO2-jaarverslag" };

const t2 = (kg: number) => (kg / 1000).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const t1 = (kg: number) => (kg / 1000).toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const gj = (v: number) => v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pc = (v: number, d = 1) => `${(Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toLocaleString("nl-NL", { minimumFractionDigits: d, maximumFractionDigits: d })}%`;

/** Kop van een invalshoek, met een gekleurde band (in de PDF op een nieuwe pagina). */
function Invalshoek({ id, letter, title, subtitle }: { id: string; letter: string; title: string; subtitle: string }) {
  return (
    <div id={id} className="mt-10 mb-4 rounded-xl bg-gradient-to-r from-brand-red to-brand-red-dark px-6 py-5 text-white print:break-before-page">
      <div className="text-xs font-semibold tracking-widest uppercase opacity-80">Invalshoek {letter}</div>
      <h2 className="text-2xl font-bold text-white">{title}</h2>
      <p className="mt-1 text-sm opacity-90">{subtitle}</p>
    </div>
  );
}

/** Tekstblok uit de verslagteksten; leeg = uitnodiging om in te vullen (alleen op het scherm). */
function Text({ value, empty, canEdit }: { value: string; empty: string; canEdit: boolean }) {
  if (value.trim()) return <div className="text-sm leading-relaxed whitespace-pre-line text-neutral-800">{value}</div>;
  return (
    <p className="rounded border border-dashed border-neutral-300 px-3 py-2 text-sm text-neutral-500 print:hidden">
      {empty}{" "}
      {canEdit && (
        <Link href="/co2/rapportage/teksten" className="text-xs">
          Tekst invullen →
        </Link>
      )}
    </p>
  );
}

function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="card mb-4 break-inside-avoid-page">
      <h3 className="mb-2 text-lg font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function PipeTable({ text, head, empty, canEdit }: { text: string; head: string[]; empty: string; canEdit: boolean }) {
  const rows = pipeTable(text);
  if (!rows.length) return <Text value="" empty={empty} canEdit={canEdit} />;
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              {head.map((_, j) => (
                <td key={j}>{r[j] ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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
      <section className="relative mb-6 overflow-hidden rounded-2xl bg-neutral-900 px-8 py-12 text-white">
        <div className="absolute -top-10 -right-10 size-56 rounded-full bg-brand-red opacity-90" aria-hidden />
        <div className="absolute right-24 -bottom-16 size-40 rounded-full bg-brand-red-dark opacity-70" aria-hidden />
        <div className="relative">
          <div className="inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-semibold tracking-widest uppercase">CO2-prestatieladder</div>
          <h2 className="mt-4 text-4xl font-bold text-white">CO2-jaarverslag {year}</h2>
          <p className="mt-1 text-xl text-white/90">Rouwmaat Groep</p>
          <div className="mt-8 grid max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              [t1(inv.totalKg), "t CO2 totaal"],
              [t1(inv.byScope[1]), "t CO2 scope 1"],
              [t1(inv.byScope[2]), "t CO2 scope 2"],
              [perFte === null ? "—" : perFte.toLocaleString("nl-NL", { maximumFractionDigits: 2 }), "t CO2 per FTE"],
            ].map(([v, l]) => (
              <div key={l}>
                <div className="text-2xl font-bold tabular-nums">{v}</div>
                <div className="text-xs text-white/70">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <nav className="card mb-6 text-sm print:hidden" aria-label="Inhoud">
        <div className="mb-2 font-semibold">Inhoud</div>
        <ol className="grid gap-1 sm:grid-cols-2">
          {[
            ["#statement", "Management statement & energiebeleid"],
            ["#organisatie", "Algemene eisen: organisatie"],
            ["#a", "Invalshoek A — CO2-uitstoot en energieverbruik"],
            ["#b", "Invalshoek B — Doelstellingen, maatregelen en voortgang"],
            ["#c", "Invalshoek C — Communicatie"],
            ["#d", "Invalshoek D — Samenwerking"],
          ].map(([href, label]) => (
            <li key={href}>
              <a href={href}>{label}</a>
            </li>
          ))}
        </ol>
      </nav>

      <Section id="statement" title="Management statement & energiebeleid">
        <Text value={texts.statement} empty="Nog geen managementstatement en energiebeleid." canEdit={canEdit} />
        {(texts.statementName || texts.statementDate) && (
          <p className="mt-3 text-sm text-neutral-600">
            {texts.statementDate && <>Datum: {texts.statementDate} · </>}
            {texts.statementName && <>Naam: {texts.statementName}</>}
          </p>
        )}
      </Section>

      <div id="organisatie" className="grid gap-4 lg:grid-cols-2">
        <Section title="Organisatiebeschrijving">
          <Text value={texts.organisation} empty="Nog geen beschrijving van de organisatie." canEdit={canEdit} />
        </Section>
        <Section title="Organisatiegrens">
          <Text value={texts.boundary} empty="Nog geen beschrijving van de organisatiegrens en de entiteiten." canEdit={canEdit} />
        </Section>
      </div>
      <Section title="CO2-prestatieladder projecten (gunningvoordeel)">
        <Text value={texts.projects} empty="Geef aan of er in het verslagjaar projecten met gunningvoordeel liepen." canEdit={canEdit} />
      </Section>

      <Invalshoek id="a" letter="A" title="Waar staan we nu?" subtitle="CO2-uitstoot en energieverbruik" />
      <Section title={`CO2-footprint scope 1 & 2 — ${year}`}>
        <p className="mb-3 text-sm text-neutral-700">
          De CO2-footprint is opgesteld conform het GHG-protocol, met {EMISSION_TYPE_LABEL[inv.type].toLowerCase()}-emissiefactoren. {emission.join(" ")}
        </p>
        <div className="overflow-x-auto">
          <ScopeTable s={1} title="Scope 1" />
          <ScopeTable s={2} title="Scope 2 (market based)" />
          {by(3).length > 0 && <ScopeTable s={3} title="Zakelijk reizen (business travel)" />}
        </div>
        <p className="text-sm font-semibold">Totale emissies scope 1, 2 en zakelijk reizen: {t2(inv.totalKg)} t CO2</p>
        {inv.locationBased && (
          <p className="mt-2 text-sm text-neutral-700">
            Location based scope 2: {Math.round(inv.locationBased.kwh).toLocaleString("nl-NL")} kWh ×{" "}
            {inv.locationBased.factorKg === null ? "—" : Math.round(inv.locationBased.factorKg * 1000)} g/kWh ={" "}
            {inv.locationBased.kg === null ? "—" : t1(inv.locationBased.kg)} t CO2.
          </p>
        )}
      </Section>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={`CO2-footprint scope 1 & 2 — ${year}`} subtitle="t CO2 per groep, heel jaar">
          <GroupDonut items={inv.groups.map((g) => ({ group: g.group, value: g.kg / 1000 }))} unit=" t" centerLabel="t CO2" decimals={1} />
        </ChartCard>
        <ChartCard title={`Energiebalans — ${year}`} subtitle="GJ per groep, heel jaar (figuur M2)">
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
        <Text value={texts.nonCo2} empty="Geef aan of er niet-CO2-broeikasgassen (bijv. koelgassen) in de organisatie zijn." canEdit={canEdit} />
      </Section>

      <Section title="Energiebeoordeling: brandstofgebruik">
        <p className="mb-3 text-sm leading-relaxed text-neutral-800">{fuel.sentences.join(" ") || "Nog geen brandstofverbruik in liters."}</p>
        <ChartCard title="Brandstofverbruik per jaar" subtitle="liter per energiedrager" className="border-0 p-0 shadow-none">
          <FuelPerYear perYear={fuel.perYear} carriers={fuel.carriers} />
        </ChartCard>
      </Section>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Figuur V1. Milieuclassificaties vrachtwagens per jaar" subtitle="Aantal vrachtwagens per Euroklasse">
          <FleetFigure kind="EURO" manual={fleetManual} vehicles={fleetVehicles} vehicleType="TRUCK" />
        </ChartCard>
        <ChartCard title="Figuur V3. Brandstoftypes wagenpark" subtitle="Aantal voertuigen per brandstoftype">
          <FleetFigure kind="FUEL" manual={fleetManual} vehicles={fleetVehicles} />
        </ChartCard>
      </div>
      <Section title="Conclusies, aanbevelingen en genomen maatregelen">
        <Text value={texts.conclusions} empty="Nog geen conclusies en aanbevelingen." canEdit={canEdit} />
      </Section>
      <Section title="Flexibiliteit van het energiesysteem">
        <Text
          value={texts.flexibility}
          empty="Beschrijf hoe de organisatie bijdraagt aan een flexibel energiesysteem (netcongestie, slim laden)."
          canEdit={canEdit}
        />
      </Section>

      <Invalshoek id="b" letter="B" title="Van inzicht naar reductie" subtitle="Onze doelstellingen en actieplan" />
      <Section title="Strategie">
        <Text value={texts.strategy} empty="Beschrijf de strategie (korte termijn) om de CO2-uitstoot te verminderen." canEdit={canEdit} />
      </Section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="CO2-doelstelling">
          <p className="mb-3 rounded-lg bg-neutral-50 px-4 py-3 text-base font-semibold text-neutral-900 italic">
            {pva.target?.text12 ?? pva.target?.textAll ?? target?.description ?? target?.title ?? "Nog geen doelstelling."}
          </p>
          <table className="table">
            <thead>
              <tr>
                <th colSpan={2}>Subdoelstellingen CO2</th>
              </tr>
            </thead>
            <tbody>
              {([1, 2] as const).map((s) => (
                <tr key={s}>
                  <td className="font-medium">Scope {s}</td>
                  <td>
                    {pc(scopePct(s))} reductie in {targetYear} vergeleken met {baseYear}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        <Section title="Energiedoelstelling">
          <p className="mb-3 rounded-lg bg-neutral-50 px-4 py-3 text-base font-semibold text-neutral-900 italic">
            Rouwmaat Groep wil in {targetYear} het energieverbruik met {pc(energyPct, 0)} verminderen ten opzichte van {baseYear}.
          </p>
          <PipeTable
            text={texts.energyGoals}
            head={["Subdoelstelling energie", "Doel"]}
            empty="Vul de subdoelstellingen energie in (zelf opwekken, opslag, duurzame energie)."
            canEdit={canEdit}
          />
        </Section>
      </div>
      <Section title="Plan van aanpak — maatregelen met de grootste reductie">
        {topMeasures.length ? (
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
        <p className="mt-2 text-xs text-neutral-500">
          Alle maatregelen: <Link href="/co2/plan">plan van aanpak</Link> · berekening: <Link href="/co2/plan/berekening">berekening doelstelling</Link>
        </p>
      </Section>
      <Section title="Verantwoording doelstellingen">
        <Text
          value={texts.justification}
          empty="Licht toe waarom de doelstelling ambitieus en realistisch is (sectorgenoten, Trias Energetica)."
          canEdit={canEdit}
        />
      </Section>

      <Section title="Voortgang jaarlijkse CO2-emissies (t CO2)">
        <div className="overflow-x-auto">
          <table className="table" data-export-name="Voortgang CO2">
            <thead>
              <tr>
                <th>Emissiestroom</th>
                {years.map((y) => (
                  <th key={y} className="text-right">
                    {y}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([k, s]) => (
                <tr key={k}>
                  <td>{s.name}</td>
                  {progress.map((p) => (
                    <td key={p.year} className="text-right tabular-nums">
                      {valOf(p, k, "kg") ? t2(valOf(p, k, "kg")) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="bg-neutral-50 font-semibold">
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
        {year === baseYear && (
          <p className="mt-2 text-sm text-neutral-700">
            {year} is het basisjaar voor de huidige reductiedoelstelling; de voortgang ten opzichte van de doelstelling is vanaf verslagjaar {year + 1}{" "}
            zichtbaar.
          </p>
        )}
      </Section>
      <Section title="Voortgang energieverbruik (GJ)">
        <div className="overflow-x-auto">
          <table className="table" data-export-name="Voortgang energie">
            <thead>
              <tr>
                <th>Emissiestroom</th>
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
              <tr className="bg-neutral-50 font-semibold">
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
      </Section>
      <Section title="Vergelijking met sectorgenoten">
        <PipeTable
          text={texts.peers}
          head={[
            "",
            "Organisatie",
            "Trede / niveau",
            "Basisjaar",
            "Intensiteit basisjaar",
            "Laatst bekende intensiteit",
            "Voortgang",
            "Korte termijn doelstelling",
          ]}
          empty="Vul de vergelijking met sectorgenoten in."
          canEdit={canEdit}
        />
        {texts.peersText && <div className="mt-3 text-sm whitespace-pre-line text-neutral-800">{texts.peersText}</div>}
      </Section>

      <Invalshoek id="c" letter="C" title="CO2-bewustwording" subtitle="Binnen en buiten de organisatie" />
      <Section title="Sleutelpersonen">
        <PipeTable text={texts.keyPersons} head={["Rol", "Naam", "Taak", "CO2-bewustzijn"]} empty="Vul de sleutelpersonen in." canEdit={canEdit} />
      </Section>
      <Section title="Communicatieplan">
        <Text value={texts.communication} empty="Beschrijf de interne en externe communicatie (doelgroepen, boodschap, doel)." canEdit={canEdit} />
        <div className="mt-3">
          <PipeTable
            text={texts.channels}
            head={["Middel", "Planning", "Verantwoordelijke", "Toelichting"]}
            empty="Vul de communicatiemiddelen in."
            canEdit={canEdit}
          />
        </div>
      </Section>

      <Invalshoek id="d" letter="D" title="Samenwerking" subtitle="Inventarisatie kennis- en samenwerkingsbehoeftes" />
      <Section title="Kennis- en samenwerkingsbehoeftes">
        <Text value={texts.collaboration} empty="Beschrijf de kennis- en samenwerkingsbehoeftes." canEdit={canEdit} />
      </Section>
      <Section title="Samenwerkingsverbanden">
        {pipeTable(texts.partners).length ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {pipeTable(texts.partners).map((r, i) => (
              <li key={i} className="rounded-lg bg-neutral-50 px-3 py-2 text-sm">
                🤝 {r.join(" — ")}
              </li>
            ))}
          </ul>
        ) : (
          <Text value="" empty="Vul de samenwerkingsverbanden in (één per regel)." canEdit={canEdit} />
        )}
      </Section>
      <p className="mt-6 text-center text-xs text-neutral-500">
        Rouwmaat Groep · CO2-jaarverslag {year} · cijfers uit het IMS ({EMISSION_TYPE_LABEL[inv.type]}), stand{" "}
        {new Date().toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam" })}
      </p>
    </>
  );
}
