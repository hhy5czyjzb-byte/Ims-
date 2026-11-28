import Link from "next/link";
import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { formatDate } from "@/lib/format";
import { ACTION_STATUS_CLASS, ACTION_STATUS_LABEL } from "@/lib/labels";
import { PLAN_SECTIONS, STREAM_GROUPS } from "@/lib/co2";
import { getMeasureLookups } from "@/lib/co2-data";
import { loadPlanData } from "@/lib/co2-plan-data";
import { Badge, Disclosure, PageHeader } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { Co2Nav } from "@/components/co2-nav";
import { Co2MeasureForm } from "@/components/co2-measure-form";
import { PlanTabs } from "./plan-tabs";
import { createCo2Measure, savePvaDocument } from "./actions";

export const metadata = { title: "Plan van aanpak" };

const t1 = (kg: number) => (kg / 1000).toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const p1 = (v: number) => `${v.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const p2 = (v: number) => `${v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

type Data = Awaited<ReturnType<typeof loadPlanData>>;
type Measure = Data["measures"][number];

/** Kolommen zoals het tabblad "Plan van aanpak" van het CO2-dashboard (trede 2 = vanaf trede 2 verplicht). */
const COLUMNS: { label: string; value: (m: Measure) => ReactNode; trede2?: boolean; w?: string }[] = [
  { label: "Toelichting maatregel", value: (m) => m.description, w: "min-w-64" },
  { label: "Deadline", value: (m) => m.co2Measure?.deadlineText ?? (m.deadline ? formatDate(m.deadline) : null), w: "w-24" },
  { label: "Planning", value: (m) => m.co2Measure?.planning, w: "min-w-40" },
  { label: "SKAO/eigen maatregel?", value: (m) => m.co2Measure?.skao, w: "w-28" },
  { label: "Indien SKAO A/B/C", value: (m) => m.co2Measure?.skaoCategory, w: "w-20" },
  { label: "Termijn", value: (m) => m.co2Measure?.term, w: "w-28" },
  { label: "Verantwoordelijke(n)/ sleutelpersoon", value: (m) => m.owner?.name ?? m.ownerText, w: "w-36" },
  { label: "Kennisbehoefte", value: (m) => m.co2Measure?.knowledgeNeed, w: "min-w-36" },
  { label: "Voortgang (status update) per jaar", value: (m) => m.co2Measure?.progressNote, w: "min-w-40" },
  { label: "TRL", value: (m) => m.co2Measure?.trl, trede2: true, w: "w-32" },
  { label: "Invloed flexibiliteit energiesysteem", value: (m) => m.co2Measure?.flexibilityImpact, trede2: true, w: "w-24" },
  { label: "Investering", value: (m) => m.co2Measure?.investment, trede2: true, w: "min-w-36" },
  { label: "Wetgeving", value: (m) => m.co2Measure?.legislation, w: "min-w-36" },
  { label: "Benodigde middelen/ voorbereidende acties", value: (m) => m.co2Measure?.resources, w: "min-w-40" },
  { label: "Toepassing op waardeketen?", value: (m) => m.co2Measure?.valueChain, trede2: true, w: "w-24" },
  { label: "Actiepunten voor huidig jaar", value: (m) => m.co2Measure?.currentYearActions, w: "min-w-40" },
  { label: "Van toepassing op project met gunningvoordeel", value: (m) => m.co2Measure?.tenderAdvantage, w: "min-w-32" },
  { label: "Onderbouwing indien niet van toepassing", value: (m) => m.co2Measure?.notApplicableReason, w: "min-w-40" },
];

function MeasureTable({ title, list, compact, calc }: { title: string; list: Measure[]; compact: boolean; calc: Data["calc"] }) {
  const red = (id: string) => calc.measures.find((x) => x.id === id);
  return (
    <section className="card mb-4 overflow-x-auto p-0">
      <table className="table text-xs" data-export-name={title}>
        <thead>
          <tr>
            {!compact && <th className="w-32">Type maatregel</th>}
            <th className="min-w-56 text-sm">{title}</th>
            {compact ? (
              <>
                <th>Deadline</th>
                <th>SKAO/eigen</th>
                <th>Termijn</th>
                <th>Verantwoordelijke</th>
                <th>Voortgang</th>
                <th className="text-right">Reductie op emissiestroom</th>
                <th className="text-right">Reductie op totaal</th>
                <th className="text-right">Verwacht (t CO2)</th>
              </>
            ) : (
              COLUMNS.map((c) => (
                <th key={c.label} className={c.w}>
                  {c.label}
                  {c.trede2 && <span className="block font-normal tracking-normal normal-case text-neutral-400">vanaf trede 2</span>}
                </th>
              ))
            )}
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {list.map((m) => {
            const r = red(m.id);
            return (
              <tr key={m.id} className={`align-top ${m.status === "CANCELLED" ? "text-neutral-400 line-through" : ""}`}>
                {!compact && <td>{m.co2Measure?.measureType ?? <span className="text-neutral-300">—</span>}</td>}
                <td>
                  <Link href={`/co2/plan/${m.id}`} className="font-medium">
                    {m.title}
                  </Link>
                  <span className="ml-1 text-neutral-400">#{m.number}</span>
                </td>
                {compact ? (
                  <>
                    <td className="whitespace-nowrap">{m.co2Measure?.deadlineText ?? (m.deadline ? formatDate(m.deadline) : "—")}</td>
                    <td>
                      {m.co2Measure?.skao ?? "—"}
                      {m.co2Measure?.skaoCategory && !/^n\.?v\.?t/i.test(m.co2Measure.skaoCategory) && ` (${m.co2Measure.skaoCategory})`}
                    </td>
                    <td>{m.co2Measure?.term ?? "—"}</td>
                    <td>{m.owner?.name ?? m.ownerText ?? "—"}</td>
                    <td>{m.co2Measure?.progressNote ?? "—"}</td>
                    <td className="text-right tabular-nums">{r && r.streamPct ? p2(r.streamPct) : "—"}</td>
                    <td className="text-right tabular-nums">{r && r.totalPct ? p2(r.totalPct) : "—"}</td>
                    <td className="text-right tabular-nums">{r && r.kg ? t1(r.kg) : "—"}</td>
                  </>
                ) : (
                  COLUMNS.map((c) => (
                    <td key={c.label} className="whitespace-pre-line">
                      {c.value(m) ?? <span className="text-neutral-300">—</span>}
                    </td>
                  ))
                )}
                <td>
                  <Badge className={ACTION_STATUS_CLASS[m.status]}>{ACTION_STATUS_LABEL[m.status]}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ weergave?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const compact = sp.weergave === "compact";
  const canEdit = can(user.role, "co2.manage");
  const [d, lookups] = await Promise.all([loadPlanData(), canEdit ? getMeasureLookups() : Promise.resolve(null)]);
  const { measures, groupOf, calc, baseYear, target, pva, inv } = d;
  const byGroup = (g: string) => measures.filter((m) => groupOf(m.co2Measure?.streamGroup) === g);
  const otherGroups = [...new Set(measures.map((m) => groupOf(m.co2Measure?.streamGroup)))].filter(
    (g) => !(STREAM_GROUPS as readonly string[]).includes(g) && !(PLAN_SECTIONS as readonly string[]).includes(g),
  );
  const active = measures.filter((m) => m.status !== "CANCELLED");
  const targetPct = target ? Number(target.reductionPct) : null;
  const skaoCount = (cat: string) => active.filter((m) => m.co2Measure?.skaoCategory?.trim().toUpperCase() === cat).length;
  const sectionText = (title: string) => pva.doc?.sections.find((s) => s.title === title)?.text ?? null;

  return (
    <>
      <PageHeader
        title="CO2-prestatieladder"
        description="Plan van aanpak — onderdeel van het energiemanagement actieplan zoals vermeld in eis 3.B.2 en conform ISO 50001. Elke maatregel is ook een actie in de actielijst."
      />
      <Co2Nav />
      <PlanTabs />

      <section className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          [`Uitstoot basisjaar ${baseYear}`, `${t1(inv.totalKg)} t`],
          ["Maatregelen (lopend + gereed)", String(active.length)],
          ["Reductiepotentieel maatregelen", p1(calc.totalPct)],
          ["Doelstelling", targetPct === null ? "—" : `${p1(targetPct)} in ${target!.targetYear}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-neutral-200 bg-white px-3 py-2">
            <div
              className={`text-xl font-bold tabular-nums ${label.startsWith("Reductiepotentieel") && targetPct !== null ? (calc.totalPct >= targetPct ? "text-green-700" : "text-amber-700") : ""}`}
            >
              {value}
            </div>
            <div className="text-xs text-neutral-500">{label}</div>
          </div>
        ))}
      </section>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm print:hidden">
        <span className="text-neutral-600">
          {compact
            ? "Compacte weergave met de verwachte reductie."
            : "Alle kolommen zoals in het CO2-dashboard; veeg of scrol opzij voor de rest van de kolommen."}
        </span>
        <Link href={compact ? "?" : "?weergave=compact"}>{compact ? "Alle kolommen (zoals Excel)" : "Compacte weergave"}</Link>
      </div>

      {STREAM_GROUPS.filter((g) => byGroup(g).length > 0).map((g) => (
        <MeasureTable key={g} title={g} list={byGroup(g)} compact={compact} calc={calc} />
      ))}
      {otherGroups.map((g) => (
        <MeasureTable key={g} title={g} list={byGroup(g)} compact={compact} calc={calc} />
      ))}
      {measures.length === 0 && <p className="mb-4 text-sm text-neutral-500">Nog geen maatregelen. Voeg ze toe of lees het plan van aanpak in via Inlezen.</p>}

      <section className="card mb-4">
        <h2>Energiebeoordeling</h2>
        <p className="mt-1 text-sm whitespace-pre-line text-neutral-700">
          {pva.doc?.intro ??
            "Beschrijf welke maatregelen zijn opgenomen in dit PVA voor scope 1, 2 en BT en welke maatregelen nog niet zijn opgenomen, maar wel interessante mogelijkheden bieden voor CO2-reductie."}
        </p>
      </section>
      {PLAN_SECTIONS.map((s) => {
        const list = byGroup(s);
        const text = sectionText(s);
        return (
          <section key={s} className="mb-4">
            <h3 className="mb-1 text-sm font-semibold">{s}</h3>
            {text ? (
              <p className="mb-2 text-sm whitespace-pre-line text-neutral-700">{text}</p>
            ) : (
              !list.length && <p className="mb-2 text-sm text-neutral-400">—</p>
            )}
            {list.length > 0 && <MeasureTable title={s} list={list} compact={compact} calc={calc} />}
          </section>
        );
      })}

      <section className="card mb-6 overflow-x-auto p-0">
        <table className="table w-auto">
          <tbody>
            {(["A", "B", "C"] as const).map((cat) => (
              <tr key={cat}>
                <td>Optelsom categorie {cat} maatregel</td>
                <td className="text-right tabular-nums">{skaoCount(cat)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {canEdit && (
        <section className="card mb-4 print:hidden">
          <Disclosure summary="Teksten energiebeoordeling wijzigen">
            <Form key={pva.importedAt ?? "leeg"} action={savePvaDocument} className="mt-3 space-y-3">
              <label className="block">
                <span className="label">Energiebeoordeling (inleiding)</span>
                <textarea name="intro" rows={3} className="input" defaultValue={pva.doc?.intro ?? ""} />
              </label>
              {PLAN_SECTIONS.map((s, i) => (
                <label key={s} className="block">
                  <span className="label">{s}</span>
                  <input type="hidden" name={`title_${i}`} value={s} />
                  <textarea name={`text_${i}`} rows={2} className="input" defaultValue={sectionText(s) ?? ""} />
                </label>
              ))}
              <SubmitButton>Opslaan</SubmitButton>
            </Form>
          </Disclosure>
        </section>
      )}
      {canEdit && lookups && (
        <section className="card mt-2 print:hidden">
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
