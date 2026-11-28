import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { getLookups } from "@/lib/lookups";
import { formatTonnes, formatPct } from "@/lib/co2";
import { loadFactors, targetStatus } from "@/lib/co2-data";
import { Badge, Disclosure, EmptyState, PageHeader, ProgressBar } from "@/components/ui";
import { Co2Nav } from "@/components/co2-nav";
import { TargetForm } from "@/components/target-form";
import { createTarget } from "../actions";

export const metadata = { title: "Reductiedoelstellingen" };

export default async function TargetsPage() {
  const user = await requireUser();
  const [targets, lookups, factors] = await Promise.all([
    prisma.reductionTarget.findMany({
      orderBy: [{ active: "desc" }, { targetYear: "asc" }],
      include: { discipline: true, _count: { select: { measures: true } } },
    }),
    getLookups(),
    loadFactors(),
  ]);
  const rows = await Promise.all(targets.map(async (t) => ({ t, s: await targetStatus(t, factors) })));

  return (
    <>
      <PageHeader
        title="CO2-prestatieladder"
        description="Reductiedoelstellingen met voortgang ten opzichte van het basisjaar, en de maatregelen om ze te halen."
      />
      <Co2Nav />
      {can(user.role, "co2.manage") && (
        <div className="mb-6">
          <Disclosure summary="Doelstelling toevoegen" open={targets.length === 0}>
            <TargetForm formAction={createTarget} disciplines={lookups.disciplines} submitLabel="Opslaan" />
          </Disclosure>
        </div>
      )}
      {rows.length === 0 ? (
        <EmptyState>Nog geen reductiedoelstellingen.</EmptyState>
      ) : (
        <div className="space-y-3">
          {rows.map(({ t, s }) => {
            const pct = Number(t.reductionPct);
            const latest = s.latestFull;
            return (
              <Link
                key={t.id}
                href={`/co2/doelstellingen/${t.id}`}
                className={`card block text-inherit no-underline hover:border-brand-red hover:no-underline ${t.active ? "" : "opacity-60"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2>{t.title}</h2>
                    <div className="text-sm text-neutral-600">
                      −{pct} % in {t.targetYear} t.o.v. {t.baseYear} · {t.scope ? `scope ${t.scope}` : "totaal"} · {t.discipline?.name ?? "bedrijfsbreed"} ·{" "}
                      {t._count.measures} maatregel(en)
                    </div>
                  </div>
                  <div>
                    {latest?.onTrack === true && <Badge className="bg-green-100 text-green-800">Op koers</Badge>}
                    {latest?.onTrack === false && <Badge className="bg-red-100 text-brand-red-dark">Achter op schema</Badge>}
                    {!t.active && <Badge className="ml-1 bg-neutral-200">Niet actief</Badge>}
                  </div>
                </div>
                <div className="mt-3 grid gap-3 text-sm md:grid-cols-[1fr_auto]">
                  <div>
                    <ProgressBar
                      value={pct > 0 && latest ? (Math.max(0, latest.actualPct) / pct) * 100 : 0}
                      tone={latest ? (latest.onTrack ? "good" : "bad") : undefined}
                    />
                    <div className="mt-1 text-xs text-neutral-500">
                      {latest
                        ? `${latest.year}: ${formatPct(latest.actualPct)} gereduceerd van ${pct} % (verwacht op dit moment: ${formatPct(latest.plannedPct)})`
                        : "Nog geen volledig jaar na het basisjaar"}
                    </div>
                  </div>
                  <div className="text-right text-xs text-neutral-500">
                    Basisjaar: {formatTonnes(s.baseKg)}
                    {s.baseFromData ? "" : " (handmatig)"}
                    {latest && (
                      <div>
                        {latest.year}: {formatTonnes(latest.kg)}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
