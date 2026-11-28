import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { formatDate } from "@/lib/format";
import { Disclosure, EmptyState, PageHeader } from "@/components/ui";
import { Co2Nav } from "@/components/co2-nav";
import { DkmpForm } from "@/components/dkmp-form";
import { createDkmpItem } from "./actions";

export const metadata = { title: "DKMP" };

export default async function DkmpPage() {
  const user = await requireUser();
  const canEdit = can(user.role, "co2.manage");
  const [items, carriers] = await Promise.all([
    prisma.dataQualityItem.findMany({
      orderBy: [{ sortOrder: "asc" }, { section: "asc" }, { stream: "asc" }],
      include: { carrier: { select: { name: true } } },
    }),
    prisma.energyCarrier.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const sections = [...new Set(items.map((i) => i.section))];
  const incomplete = items.filter((i) => !i.source || !i.executor).length;
  return (
    <>
      <PageHeader
        title="CO2-prestatieladder"
        description="Datakwaliteitsmanagementplan (DKMP, ISO 14064-1): per emissiestroom waar de data vandaan komt, wie ze aanlevert en verwerkt, wanneer, welke onzekerheden er zijn en hoe de datakwaliteit verbetert."
      />
      <Co2Nav />
      {incomplete > 0 && (
        <p className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{incomplete} regel(s) zonder bron of uitvoerder.</p>
      )}
      {items.length === 0 ? (
        <EmptyState>Nog geen DKMP. Lees het in via Inlezen (tabblad DKMP uit het CO2-dashboard) of voeg regels toe.</EmptyState>
      ) : (
        sections.map((s) => (
          <section key={s} className="card mb-4 overflow-x-auto p-0">
            <table className="table">
              <thead>
                <tr>
                  <th>{s}</th>
                  <th>Eenheid</th>
                  <th>Bron</th>
                  <th>Brondata van</th>
                  <th>Uitvoerder</th>
                  <th>Uitvraag / analyse</th>
                  <th>Onzekerheden</th>
                  <th>Verbeterplan</th>
                </tr>
              </thead>
              <tbody>
                {items
                  .filter((i) => i.section === s)
                  .map((i) => (
                    <tr key={i.id}>
                      <td>
                        {canEdit ? (
                          <Link href={`/co2/dkmp/${i.id}`} className="font-medium">
                            {i.stream}
                          </Link>
                        ) : (
                          <span className="font-medium">{i.stream}</span>
                        )}
                        {i.carrier && <div className="text-xs text-neutral-500">{i.carrier.name}</div>}
                        {i.qualityScore && <div className="text-xs text-neutral-500">kwaliteit {i.qualityScore}/5</div>}
                      </td>
                      <td className="text-xs">{i.unit ?? "—"}</td>
                      <td className="text-xs">{i.source ?? <span className="text-amber-700">ontbreekt</span>}</td>
                      <td className="text-xs">{i.dataOwner ?? "—"}</td>
                      <td className="text-xs">{i.executor ?? <span className="text-amber-700">ontbreekt</span>}</td>
                      <td className="text-xs whitespace-nowrap">
                        {i.requestPeriod ?? "—"} / {i.analysisPeriod ?? "—"}
                        {i.lastCheckedAt && <div className="text-neutral-500">gecontroleerd {formatDate(i.lastCheckedAt)}</div>}
                      </td>
                      <td className="max-w-64 text-xs">{i.uncertainty ?? "—"}</td>
                      <td className="max-w-64 text-xs">{i.improvement ?? "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        ))
      )}
      {canEdit && (
        <section className="card mt-6 print:hidden">
          <Disclosure summary="Regel toevoegen">
            <div className="mt-3">
              <DkmpForm
                formAction={createDkmpItem}
                carriers={carriers.map((c) => ({ value: c.id, label: c.name }))}
                sections={sections}
                submitLabel="Toevoegen"
              />
            </div>
          </Disclosure>
        </section>
      )}
    </>
  );
}
