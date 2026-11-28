import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { EURO_CLASSES, VEHICLE_TYPES, categoriesOf, euroLabel, fleetSeries, fuelLabel, vehicleLabel, type FleetKind, type FleetSeries } from "@/lib/fleet";
import { Disclosure, EmptyState, Field, PageHeader } from "@/components/ui";
import { ChartCard, GroupedColumns } from "@/components/charts";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { Co2Nav } from "@/components/co2-nav";
import { pasteFleetTable, saveFleetYear } from "./actions";

export const metadata = { title: "Wagenpark" };

const pct = (n: number) => `${n.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%`;
const SOURCE_LABEL = { manual: "jaartabel", register: "register", mixed: "tabel + register", none: "—" } as const;

function FleetTable({ s, years }: { s: FleetSeries; years: number[] }) {
  const label = (k: string) => (s.kind === "FUEL" ? fuelLabel(k) : euroLabel(k));
  const hasUnknown = years.some((y) => s.unknown(y) > 0);
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>{s.kind === "FUEL" ? "Brandstoftype" : "Milieuclassificatie"}</th>
            {years.map((y) => (
              <th key={y} className="text-right">
                {y}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {s.categories.map((c) => (
            <tr key={c.key}>
              <td>{label(c.key)}</td>
              {years.map((y) => (
                <td key={y} className="text-right tabular-nums">
                  {s.value(c.key, y)}
                </td>
              ))}
            </tr>
          ))}
          {hasUnknown && (
            <tr className="text-amber-800">
              <td>Onbekend (register)</td>
              {years.map((y) => (
                <td key={y} className="text-right tabular-nums">
                  {s.unknown(y) || ""}
                </td>
              ))}
            </tr>
          )}
          <tr className="bg-neutral-50 font-semibold">
            <td>Totaal</td>
            {years.map((y) => (
              <td key={y} className="text-right tabular-nums">
                {s.total(y)}
              </td>
            ))}
          </tr>
          <tr>
            <td className="text-neutral-600">Aandeel zero-emissie</td>
            {years.map((y) => (
              <td key={y} className="text-right tabular-nums text-neutral-600">
                {pct(s.zeroPct(y))}
              </td>
            ))}
          </tr>
          <tr>
            <td className="text-xs text-neutral-500">Bron</td>
            {years.map((y) => (
              <td key={y} className="text-right text-xs text-neutral-500">
                {SOURCE_LABEL[s.source(y)]}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function FleetChart({
  s,
  years,
  title,
  subtitle,
  allCategories,
}: {
  s: FleetSeries;
  years: number[];
  title: string;
  subtitle: string;
  allCategories?: boolean;
}) {
  const cats = allCategories ? categoriesOf(s.kind) : s.categories;
  if (!years.length || years.every((y) => s.total(y) === 0))
    return (
      <ChartCard title={title} subtitle={subtitle} className="mb-6">
        <p className="text-sm text-neutral-500">Nog geen gegevens.</p>
      </ChartCard>
    );
  return (
    <ChartCard title={title} subtitle={subtitle} className="mb-6">
      <GroupedColumns
        groups={[...cats.map((c) => c.label), "Totaal"]}
        series={years.map((y) => ({ name: String(y), values: [...cats.map((c) => s.value(c.key, y)), s.total(y)] }))}
        height={240}
        unit=" voertuigen"
      />
      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-neutral-600">Tabel</summary>
        <FleetTable s={s} years={years} />
      </details>
    </ChartCard>
  );
}

export default async function FleetPage({
  searchParams,
}: {
  searchParams: Promise<{ soort?: string; jaar?: string; invoer?: string; jaren?: string; lopend?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const canEdit = can(user.role, "co2.manage");
  const [manual, vehicles] = await Promise.all([
    prisma.fleetCount.findMany({ orderBy: [{ year: "asc" }] }),
    prisma.equipment.findMany({
      where: { vehicleType: { not: null } },
      select: { vehicleType: true, fuelType: true, euroClass: true, inServiceFrom: true, inServiceUntil: true, active: true },
    }),
  ]);
  const presentTypes = VEHICLE_TYPES.filter((v) => manual.some((r) => r.vehicleType === v.key) || vehicles.some((r) => r.vehicleType === v.key));
  const type = sp.soort === "alle" ? undefined : (sp.soort ?? (presentTypes.some((v) => v.key === "TRUCK") ? "TRUCK" : undefined));
  const current = sp.lopend === "ja";
  const fuel = fleetSeries("FUEL", manual, vehicles, type, undefined, current);
  const euro = fleetSeries("EURO", manual, vehicles, type, undefined, current);
  const allYears = [...new Set([...fuel.years, ...euro.years])].sort((a, b) => a - b);
  // Standaard de laatste 6 jaar (zoals de figuren in de rapportage); 'alle jaren' via ?jaren=alle.
  const years = sp.jaren === "alle" ? allYears : allYears.slice(-6);
  const link = (extra: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ soort: sp.soort, jaren: sp.jaren, lopend: sp.lopend, ...extra })) if (v) q.set(k, v);
    return `?${q.toString()}`;
  };
  const title = type ? vehicleLabel(type) : "Alle voertuigen";
  const last = years[years.length - 1];
  const range = years.length ? `${years[0]}–${last}` : "";
  // Tegels uit de reeks met de meeste voertuigen; verschillen tussen beide reeksen worden gemeld.
  const main = last !== undefined && fuel.total(last) > euro.total(last) ? fuel : euro;
  const mismatch = years.filter((y) => fuel.total(y) && euro.total(y) && fuel.total(y) !== euro.total(y));
  const euro6 = last !== undefined && euro.total(last) ? ((euro.value("EURO6", last) + euro.value("ELECTRIC", last)) / euro.total(last)) * 100 : null;

  // Invoer
  const kind: FleetKind = sp.invoer === "EURO" ? "EURO" : "FUEL";
  const editYear = Number(sp.jaar) || (last ?? new Date().getUTCFullYear() - 1);
  const val = (y: number, v: string, c: string) => manual.find((r) => r.year === y && r.vehicleType === v && r.kind === kind && r.value === c)?.count;
  const cats = categoriesOf(kind);
  const colLabel = (k: string) => (kind === "FUEL" ? fuelLabel(k) : euroLabel(k));
  const keep = (extra: Record<string, string>) =>
    new URLSearchParams({ ...(type ? { soort: type } : {}), jaar: String(editYear), invoer: kind, ...extra }).toString();

  return (
    <>
      <PageHeader
        title="CO2-prestatieladder"
        description="Samenstelling van het wagenpark per jaar: brandstoftypes (figuur V3) en milieuclassificatie / Euroklasse (figuur V1). Berekend uit het voertuigenregister, of uit jaartabellen die je invult of uit Excel plakt."
      />
      <Co2Nav />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2 print:hidden">
        <form className="flex flex-wrap items-end gap-2">
          {sp.jaren && <input type="hidden" name="jaren" value={sp.jaren} />}
          {sp.lopend && <input type="hidden" name="lopend" value={sp.lopend} />}
          <Field label="Soort voertuig">
            <select name="soort" defaultValue={type ?? "alle"} className="input">
              <option value="alle">Alle voertuigen</option>
              {VEHICLE_TYPES.map((v) => (
                <option key={v.key} value={v.key}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
          <button className="btn-secondary">Tonen</button>
        </form>
        <div className="flex gap-2 text-sm">
          <Link href="/co2/materieel" className="btn-secondary">
            Voertuigenregister ({vehicles.length})
          </Link>
          {canEdit && (
            <Link href="/co2/materieel/import" className="btn-secondary">
              Voertuigenlijst inlezen
            </Link>
          )}
        </div>
      </div>

      {years.length === 0 ? (
        <EmptyState>
          Nog geen gegevens voor {title.toLowerCase()}. Lees een voertuigenlijst in (kenteken, soort, brandstof, Euroklasse, in/uit dienst) of plak hieronder de
          jaartabellen uit Excel.
        </EmptyState>
      ) : (
        <>
          <section className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              [`${title} ${last}`, String(main.total(last))],
              [`Zero-emissie ${last}`, pct(main.zeroPct(last))],
              [`Euro 6 of elektrisch ${last}`, euro6 === null ? "—" : pct(euro6)],
              [`Diesel ${last}`, fuel.total(last) ? String(fuel.value("DIESEL", last)) : "—"],
            ].map(([l, v]) => (
              <div key={l} className="rounded-md border border-neutral-200 bg-white px-3 py-2">
                <div className="text-xl font-bold tabular-nums">{v}</div>
                <div className="text-xs text-neutral-500">{l}</div>
              </div>
            ))}
          </section>
          {mismatch.length > 0 && (
            <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Let op: milieuclassificatie en brandstoftypes tellen een ander aantal voertuigen in{" "}
              {mismatch.map((y) => `${y} (${euro.total(y)} / ${fuel.total(y)})`).join(", ")}. Vul voor die jaren beide jaartabellen in, of laat beide uit het
              register komen.
            </p>
          )}
          <div className="mb-3 flex flex-wrap gap-3 text-sm print:hidden">
            {allYears.length > 6 && (
              <Link href={link({ jaren: sp.jaren === "alle" ? undefined : "alle" })}>
                {sp.jaren === "alle" ? "Alleen de laatste 6 jaar" : `Alle jaren tonen (${allYears[0]}–${allYears[allYears.length - 1]})`}
              </Link>
            )}
            {vehicles.length > 0 && (
              <Link href={link({ lopend: current ? undefined : "ja" })}>
                {current ? "Lopend jaar weglaten" : `Ook ${new Date().getUTCFullYear()} tonen (stand van vandaag)`}
              </Link>
            )}
          </div>
          <FleetChart
            s={euro}
            years={years}
            title={`Milieuclassificaties per jaar – ${title.toLowerCase()}`}
            subtitle={`Aantal voertuigen per Euroklasse, ${range}`}
            allCategories
          />
          <FleetChart s={fuel} years={years} title={`Brandstoftypes – ${title.toLowerCase()}`} subtitle={`Aantal voertuigen per brandstoftype, ${range}`} />
          <p className="mb-6 text-xs text-neutral-500">
            Per soort voertuig en jaar gaat een ingevulde of geplakte jaartabel voor; anders telt de app de voertuigen uit het register die op 31 december
            (lopend jaar: vandaag) in dienst waren. De rij &lsquo;Bron&rsquo; in de tabellen laat zien waar elk jaar vandaan komt.
          </p>
        </>
      )}

      {canEdit && (
        <section className="card space-y-4 print:hidden">
          <Disclosure summary="Jaartabel uit Excel plakken" open={years.length === 0}>
            <Form key={`paste-${manual.length}`} action={pasteFleetTable} className="mt-3 grid gap-3 md:grid-cols-4">
              <Field label="Wat plak je?">
                <select name="kind" defaultValue={kind} className="input">
                  <option value="EURO">Milieuclassificatie (Euroklasse)</option>
                  <option value="FUEL">Brandstoftypes</option>
                </select>
              </Field>
              <Field label="Soort voertuig">
                <select name="vehicleType" defaultValue={type ?? "TRUCK"} className="input">
                  {VEHICLE_TYPES.map((v) => (
                    <option key={v.key} value={v.key}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tabel (kopieer de cellen in Excel en plak ze hier)" className="md:col-span-4">
                <textarea
                  name="table"
                  rows={8}
                  className="input font-mono text-xs"
                  placeholder={`Klasse\t2020\t2021\t2022\t2023\t2024\t2025\nElektrisch\t0\t0\t1\t2\t3\t4\n6\t40\t45\t50\t55\t58\t60\n5\t12\t10\t8\t6\t4\t3\n…`}
                />
              </Field>
              <p className="text-xs text-neutral-500 md:col-span-4">
                Kopregel met de jaartallen, daaronder per regel een klasse ({EURO_CLASSES.map((c) => c.label).join(", ")}) of brandstof (diesel, HVO, hybride,
                elektrisch, …). Omgekeerd (jaren onder elkaar) mag ook. De rij &lsquo;Totaal&rsquo; wordt overgeslagen. De geplakte jaren vervangen wat er voor
                die soort voertuig al stond.
              </p>
              <div className="md:col-span-4">
                <SubmitButton>Tabel inlezen</SubmitButton>
              </div>
            </Form>
          </Disclosure>

          <Disclosure summary="Aantallen per jaar invullen of wijzigen">
            <div className="mt-3 mb-3 flex flex-wrap items-end gap-2">
              <form className="flex items-end gap-2">
                {type && <input type="hidden" name="soort" value={type} />}
                <input type="hidden" name="invoer" value={kind} />
                <Field label="Jaar">
                  <input name="jaar" type="number" defaultValue={editYear} className="input w-28" />
                </Field>
                <button className="btn-secondary">Dit jaar openen</button>
              </form>
              <div className="flex gap-1 text-sm">
                {(["FUEL", "EURO"] as const).map((k) => (
                  <Link key={k} href={`?${keep({ invoer: k })}`} className={k === kind ? "btn" : "btn-secondary"}>
                    {k === "FUEL" ? "Brandstoftypes" : "Milieuclassificatie"}
                  </Link>
                ))}
              </div>
            </div>
            <Form key={`${editYear}-${kind}-${manual.length}`} action={saveFleetYear} className="space-y-3">
              <input type="hidden" name="year" value={editYear} />
              <input type="hidden" name="kind" value={kind} />
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{editYear}</th>
                      {cats.map((c) => (
                        <th key={c.key} className="text-right">
                          {colLabel(c.key)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {VEHICLE_TYPES.map((v) => (
                      <tr key={v.key}>
                        <td className="whitespace-nowrap">{v.label}</td>
                        {cats.map((c) => (
                          <td key={c.key} className="p-1">
                            <input
                              name={`c_${v.key}_${c.key}`}
                              type="number"
                              min={0}
                              aria-label={`${v.label} ${colLabel(c.key)} ${editYear}`}
                              defaultValue={val(editYear, v.key, c.key) ?? ""}
                              placeholder={val(editYear - 1, v.key, c.key) !== undefined ? String(val(editYear - 1, v.key, c.key)) : ""}
                              className="input w-20 text-right"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-neutral-500">
                Grijze getallen zijn de aantallen van {editYear - 1} (ter vergelijking). Leeg of 0 = geen voertuigen. Een jaar met ingevulde aantallen gaat voor
                op de telling uit het register; maak alles leeg om weer het register te gebruiken.
              </p>
              <SubmitButton>
                Opslaan {editYear} ({kind === "FUEL" ? "brandstoftypes" : "milieuclassificatie"})
              </SubmitButton>
            </Form>
          </Disclosure>
        </section>
      )}
    </>
  );
}
