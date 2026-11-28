import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BREAKDOWN_LABEL, breakdown, countAspects, type BreakdownKey } from "@/lib/aspect-stats";
import { PageHeader } from "@/components/ui";
import { AspectNav } from "@/components/aspect-nav";

export const metadata = { title: "Overzicht milieuaspecten" };

const PARAM: Record<BreakdownKey, string> = { bu: "bu", locatie: "locatie", context: "context", thema: "thema" };

export default async function AspectOverviewPage() {
  await requireUser();
  const all = await prisma.environmentalAspect.findMany({
    where: { active: true },
    select: {
      businessUnit: true,
      locationText: true,
      contextFactor: true,
      theme: true,
      siteType: true,
      inOperation: true,
      priority: true,
      opportunity: true,
      origin: true,
      lifecycleSource: true,
      effectScore: true,
      exposure: true,
      probability: true,
    },
  });
  const total = countAspects(all);
  const notInOperation = all.filter((a) => !a.inOperation);

  return (
    <>
      <PageHeader
        title="Milieuaspecten"
        description="Overzicht zoals op het overzichtsblad van het MAR: alleen aspecten op locaties die in werking zijn. Prio H of M = significant; het risico is effect × voorkomen × waarschijnlijkheid."
      />
      <AspectNav />

      <section className="card mb-6 text-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h2 className="mb-2">Prioriteit</h2>
            <p>
              <strong>{total.total}</strong> aspecten in werking: <strong>{total.high}</strong> prio hoog, <strong>{total.medium}</strong> middel,{" "}
              <strong>{total.low}</strong> laag
              {total.noPrio > 0 && (
                <>
                  , <strong>{total.noPrio}</strong> nog geen prio
                </>
              )}
              .
            </p>
            <p className="mt-1">
              Controle: {total.high} + {total.medium} + {total.low} + {total.noPrio} = {total.high + total.medium + total.low + total.noPrio}{" "}
              {total.high + total.medium + total.low + total.noPrio === total.total ? "✓" : "✗"} · Significant: <strong>{total.significant}</strong>, waarvan{" "}
              {total.significantOpportunities} kansen.
            </p>
          </div>
          <div>
            <h2 className="mb-2">Risicoberekening</h2>
            <p>
              Risico hoog of zeer hoog <strong>{total.riskHigh}</strong> · middel <strong>{total.riskMedium}</strong> · laag <strong>{total.riskLow}</strong> ·
              kansen <strong>{total.opportunities}</strong> · op projecten <strong>{total.projects}</strong>
            </p>
            <p className="mt-1 text-neutral-600">
              Nog niet gescoord: {total.notScored} · Prio lager dan risico: {total.signalLower} · Prio hoger dan risico: {total.signalHigher} · Levenscyclus nog
              in concept: {total.lifecycleConcept}
            </p>
          </div>
        </div>
        {notInOperation.length > 0 && (
          <p className="mt-3 text-xs text-neutral-500">
            {notInOperation.length} aspecten op locaties die tijdelijk niet in werking zijn (
            {[...new Set(notInOperation.map((a) => a.locationText ?? "—"))].join(", ")}) tellen niet mee.
          </p>
        )}
      </section>

      {(Object.keys(BREAKDOWN_LABEL) as BreakdownKey[]).map((by) => {
        const rows = breakdown(all, by);
        return (
          <section key={by} className="card mb-6 overflow-x-auto">
            <h2 className="mb-3">Per {BREAKDOWN_LABEL[by].toLowerCase()}</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>{BREAKDOWN_LABEL[by]}</th>
                  <th className="text-right">Aspecten</th>
                  <th className="text-right">Prio hoog</th>
                  <th className="text-right">Prio middel</th>
                  <th className="text-right">Prio laag</th>
                  <th className="text-right">Risico middel</th>
                  <th className="text-right">Risico hoog of zeer hoog</th>
                  <th className="text-right">Kansen</th>
                  <th className="text-right">Aanvulling</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const href = (extra: string) =>
                    `/milieuaspecten?${r.value === "(leeg)" ? "" : `${PARAM[by]}=${encodeURIComponent(r.value)}&`}werking=ja${extra}`;
                  return (
                    <tr key={r.value} className={r.counts.total === 0 ? "text-neutral-400" : ""}>
                      <td>{r.value === "(leeg)" ? r.value : <Link href={href("")}>{r.value}</Link>}</td>
                      <td className="text-right tabular-nums">{r.counts.total}</td>
                      <td className={`text-right tabular-nums ${r.counts.high ? "font-semibold text-brand-red" : ""}`}>{r.counts.high}</td>
                      <td className="text-right tabular-nums">{r.counts.medium}</td>
                      <td className="text-right tabular-nums">{r.counts.low}</td>
                      <td className="text-right tabular-nums">{r.counts.riskMedium}</td>
                      <td className={`text-right tabular-nums ${r.counts.riskHigh ? "font-semibold" : ""}`}>{r.counts.riskHigh}</td>
                      <td className="text-right tabular-nums">{r.counts.opportunities}</td>
                      <td className="text-right tabular-nums">{r.counts.addition}</td>
                    </tr>
                  );
                })}
                <tr className="font-semibold">
                  <td>Totaal</td>
                  <td className="text-right tabular-nums">{total.total}</td>
                  <td className="text-right tabular-nums">{total.high}</td>
                  <td className="text-right tabular-nums">{total.medium}</td>
                  <td className="text-right tabular-nums">{total.low}</td>
                  <td className="text-right tabular-nums">{total.riskMedium}</td>
                  <td className="text-right tabular-nums">{total.riskHigh}</td>
                  <td className="text-right tabular-nums">{total.opportunities}</td>
                  <td className="text-right tabular-nums">{total.addition}</td>
                </tr>
              </tbody>
            </table>
          </section>
        );
      })}
    </>
  );
}
