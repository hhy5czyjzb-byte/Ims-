import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { legalDisplayCode } from "@/lib/compliance";
import { OBLIGATION_CHARACTER_CLASS, OBLIGATION_CHARACTER_LABEL, STAKEHOLDER_TYPE_LABEL } from "@/lib/labels";
import { Badge, Disclosure, EmptyState, PageHeader } from "@/components/ui";
import { ObligationFields, StakeholderFields } from "@/components/stakeholder-forms";
import { ContextNav } from "@/components/context-nav";
import { createObligation, createStakeholder } from "../actions";

export const metadata = { title: "Stakeholders" };

const INFLUENCE_ORDER = ["hoog", "midden/hoog", "midden", "toenemend", "laag"];
const influenceClass = (v: string | null) =>
  !v
    ? ""
    : /^hoog/i.test(v)
      ? "bg-red-50 text-brand-red-dark"
      : /hoog/i.test(v)
        ? "bg-amber-100 text-amber-800"
        : /toenemend/i.test(v)
          ? "bg-sky-50 text-sky-800"
          : "bg-neutral-100 text-neutral-700";

export default async function StakeholdersPage() {
  const user = await requireUser();
  const canEdit = can(user.role, "context.edit");
  const [stakeholders, obligations, legal] = await Promise.all([
    prisma.stakeholder.findMany({
      orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { obligations: true } } },
    }),
    prisma.stakeholderObligation.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        stakeholders: { select: { id: true, name: true } },
        legalRequirements: {
          select: { id: true, number: true, externalRef: true, title: true, status: true },
          orderBy: [{ externalRef: "asc" }, { number: "asc" }],
        },
      },
    }),
    canEdit
      ? prisma.legalRequirement.findMany({
          where: { active: true },
          orderBy: [{ externalRef: "asc" }, { title: "asc" }],
          select: { id: true, number: true, externalRef: true, title: true },
        })
      : Promise.resolve([]),
  ]);
  const legalOptions = legal.map((l) => ({ value: l.id, label: `${legalDisplayCode(l)} ${l.title}` }));
  const stakeholderOptions = stakeholders.map((s) => ({ value: s.id, label: s.name }));
  const influences = [...new Set(stakeholders.map((s) => s.influenceLevel).filter(Boolean) as string[])].sort(
    (a, b) => INFLUENCE_ORDER.indexOf(a.toLowerCase()) - INFLUENCE_ORDER.indexOf(b.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        title="Context en stakeholders"
        description="Belanghebbenden, wat zij van ons verwachten en hoe we daarop inspelen (ISO 9001/14001 §4.2). Verwachtingen die we als verplichting overnemen koppelen we aan het register wet- en regelgeving."
      />
      <ContextNav />

      <section className="card mb-6 overflow-x-auto p-0">
        <h2 className="px-5 pt-4 pb-2">Belanghebbenden ({stakeholders.filter((s) => s.active).length})</h2>
        {stakeholders.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState>Nog geen stakeholders. Ze worden overgenomen bij het inlezen van de analyse (tabel in §5.1).</EmptyState>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Stakeholder</th>
                <th>Wat zij van ons verwachten</th>
                <th>Invloed</th>
                <th>Hoe we hierop inspelen</th>
              </tr>
            </thead>
            <tbody>
              {stakeholders.map((s) => (
                <tr key={s.id} className={s.active ? "" : "opacity-50"}>
                  <td className="w-64">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-neutral-500">
                      {STAKEHOLDER_TYPE_LABEL[s.type]}
                      {s._count.obligations > 0 && ` · ${s._count.obligations} verplichting(en)`}
                    </div>
                    {canEdit && (
                      <Link href={`/context/stakeholders/${s.id}`} className="text-xs text-neutral-500 hover:text-brand-red-dark">
                        Wijzigen
                      </Link>
                    )}
                  </td>
                  <td className="text-sm">{s.expectations ?? "—"}</td>
                  <td>{s.influenceLevel && <Badge className={influenceClass(s.influenceLevel)}>{s.influenceLevel}</Badge>}</td>
                  <td className="text-sm">{s.howAddressed ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {canEdit && (
          <div className="px-5 py-4">
            <Disclosure summary="Stakeholder toevoegen">
              <StakeholderFields formAction={createStakeholder} influences={influences} submitLabel="Toevoegen" reset />
            </Disclosure>
          </div>
        )}
      </section>

      <section id="verplichtingen" className="card scroll-mt-4 overflow-x-auto p-0">
        <h2 className="px-5 pt-4 pb-1">Verwachtingen die we als verplichting overnemen</h2>
        <p className="px-5 pb-2 text-sm text-neutral-600">
          Deze verplichtingen nemen we op in het register van wet- en regelgeving en toetsen we via de compliance-evaluatie.
        </p>
        {obligations.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState>Nog geen verplichtingen (tabel in §5.2 van de analyse).</EmptyState>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Belanghebbende</th>
                <th>Verplichting</th>
                <th>Karakter</th>
                <th>Wet- en regelgeving</th>
              </tr>
            </thead>
            <tbody>
              {obligations.map((o) => (
                <tr key={o.id}>
                  <td className="w-60">
                    <div className="font-medium">{o.stakeholderText}</div>
                    {o.stakeholders.length > 0 && <div className="text-xs text-neutral-500">{o.stakeholders.map((s) => s.name).join(", ")}</div>}
                  </td>
                  <td className="text-sm">
                    {o.obligation}
                    {canEdit && (
                      <div>
                        <Link href={`/context/stakeholders/verplichting/${o.id}`} className="text-xs text-neutral-500 hover:text-brand-red-dark">
                          Wijzigen en koppelen
                        </Link>
                      </div>
                    )}
                  </td>
                  <td>
                    <Badge className={OBLIGATION_CHARACTER_CLASS[o.character]}>{OBLIGATION_CHARACTER_LABEL[o.character]}</Badge>
                  </td>
                  <td className="text-xs">
                    {o.legalRequirements.length === 0 ? (
                      <span className={o.character === "LEGAL" ? "text-amber-700" : "text-neutral-400"}>
                        {o.character === "LEGAL" ? "Nog niet gekoppeld" : "—"}
                      </span>
                    ) : (
                      <ul className="space-y-0.5">
                        {o.legalRequirements.map((l) => (
                          <li key={l.id}>
                            <Link href={`/wetgeving/${l.id}`}>
                              {legalDisplayCode(l)} {l.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {canEdit && (
          <div className="px-5 py-4">
            <Disclosure summary="Verplichting toevoegen">
              <ObligationFields
                selectedStakeholders={[]}
                selectedLegal={[]}
                stakeholderOptions={stakeholderOptions}
                legalOptions={legalOptions}
                formAction={createObligation}
                submitLabel="Toevoegen"
                reset
              />
            </Disclosure>
          </div>
        )}
      </section>
    </>
  );
}
