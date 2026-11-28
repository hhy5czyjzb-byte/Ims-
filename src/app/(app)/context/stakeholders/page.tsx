import Link from "next/link";
import type { Stakeholder, StakeholderObligation } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { legalDisplayCode } from "@/lib/compliance";
import { OBLIGATION_CHARACTER_CLASS, OBLIGATION_CHARACTER_LABEL, STAKEHOLDER_TYPE_LABEL, options } from "@/lib/labels";
import { Badge, Disclosure, EmptyState, Field, PageHeader, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { CheckboxPicker } from "@/components/checkbox-picker";
import { ContextNav } from "@/components/context-nav";
import type { ActionResult } from "@/lib/action-result";
import { createObligation, createStakeholder, deleteObligation, deleteStakeholder, updateObligation, updateStakeholder } from "../actions";

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
                      <div className="mt-1">
                        <Disclosure summary="Wijzigen">
                          <StakeholderFields stakeholder={s} formAction={updateStakeholder.bind(null, s.id)} influences={influences} submitLabel="Opslaan" />
                          <Form action={deleteStakeholder.bind(null, s.id)} className="mt-2">
                            <SubmitButton variant="link" confirm={`"${s.name}" verwijderen?`}>
                              Verwijderen
                            </SubmitButton>
                          </Form>
                        </Disclosure>
                      </div>
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
                      <div className="mt-1">
                        <Disclosure summary="Wijzigen en koppelen">
                          <ObligationFields
                            obligation={o}
                            selectedStakeholders={o.stakeholders.map((s) => s.id)}
                            selectedLegal={o.legalRequirements.map((l) => l.id)}
                            stakeholderOptions={stakeholderOptions}
                            legalOptions={legalOptions}
                            formAction={updateObligation.bind(null, o.id)}
                            submitLabel="Opslaan"
                          />
                          <Form action={deleteObligation.bind(null, o.id)} className="mt-2">
                            <SubmitButton variant="link" confirm="Deze verplichting verwijderen?">
                              Verwijderen
                            </SubmitButton>
                          </Form>
                        </Disclosure>
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

function StakeholderFields({
  stakeholder,
  formAction,
  influences,
  submitLabel,
  reset,
}: {
  stakeholder?: Stakeholder;
  formAction: (fd: FormData) => Promise<ActionResult>;
  influences: string[];
  submitLabel: string;
  reset?: boolean;
}) {
  const listId = `infl-${stakeholder?.id ?? "nieuw"}`;
  return (
    <Form key={stakeholder?.updatedAt.toISOString()} action={formAction} resetOnSuccess={reset} className="mt-2 grid gap-3 md:grid-cols-4">
      <Field label="Naam" className="md:col-span-2">
        <input name="name" required maxLength={300} defaultValue={stakeholder?.name} className="input" />
      </Field>
      <Field label="Intern / extern">
        <Select name="type" options={options(STAKEHOLDER_TYPE_LABEL)} defaultValue={stakeholder?.type ?? "EXTERNAL"} />
      </Field>
      <Field label="Invloed">
        <input name="influenceLevel" list={listId} maxLength={50} defaultValue={stakeholder?.influenceLevel ?? ""} className="input" />
        <datalist id={listId}>
          {influences.map((i) => (
            <option key={i} value={i} />
          ))}
        </datalist>
      </Field>
      <Field label="Wat zij van ons verwachten" className="md:col-span-2">
        <textarea name="expectations" rows={2} maxLength={2000} defaultValue={stakeholder?.expectations ?? ""} className="input" />
      </Field>
      <Field label="Hoe we hierop inspelen" className="md:col-span-2">
        <textarea name="howAddressed" rows={2} maxLength={2000} defaultValue={stakeholder?.howAddressed ?? ""} className="input" />
      </Field>
      <Field label="Volgorde">
        <input name="sortOrder" type="number" min={0} defaultValue={stakeholder?.sortOrder ?? ""} className="input" />
      </Field>
      {stakeholder && (
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={stakeholder.active} /> Actief
        </label>
      )}
      <div className="self-end">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </Form>
  );
}

function ObligationFields({
  obligation,
  selectedStakeholders,
  selectedLegal,
  stakeholderOptions,
  legalOptions,
  formAction,
  submitLabel,
  reset,
}: {
  obligation?: StakeholderObligation;
  selectedStakeholders: string[];
  selectedLegal: string[];
  stakeholderOptions: { value: string; label: string }[];
  legalOptions: { value: string; label: string }[];
  formAction: (fd: FormData) => Promise<ActionResult>;
  submitLabel: string;
  reset?: boolean;
}) {
  return (
    <Form key={obligation?.updatedAt.toISOString()} action={formAction} resetOnSuccess={reset} className="mt-2 grid gap-3 md:grid-cols-4">
      <Field label="Belanghebbende(n)" className="md:col-span-2">
        <input name="stakeholderText" required maxLength={300} defaultValue={obligation?.stakeholderText} className="input" />
      </Field>
      <Field label="Karakter">
        <Select name="character" options={options(OBLIGATION_CHARACTER_LABEL)} defaultValue={obligation?.character ?? "LEGAL"} />
      </Field>
      <div />
      <Field label="Verplichting" className="md:col-span-4">
        <textarea name="obligation" required rows={2} maxLength={2000} defaultValue={obligation?.obligation} className="input" />
      </Field>
      <Field label="Stakeholders" className="md:col-span-2" group>
        <CheckboxPicker
          name="stakeholderIds"
          groups={[{ label: "Stakeholders", options: stakeholderOptions }]}
          selected={selectedStakeholders}
          height="10rem"
        />
      </Field>
      <Field label="Wettelijke eisen (register)" className="md:col-span-2" group>
        <CheckboxPicker name="legalIds" groups={[{ label: "Wet- en regelgeving", options: legalOptions }]} selected={selectedLegal} height="10rem" />
      </Field>
      <div className="md:col-span-4">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </Form>
  );
}
