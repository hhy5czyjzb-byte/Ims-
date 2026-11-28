import Link from "next/link";
import { notFound } from "next/navigation";
import { RaciType } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { can } from "@/lib/rbac";
import { getLookups, getRequirementOptions } from "@/lib/lookups";
import { RACI_CLASS, RACI_LABEL } from "@/lib/labels";
import { residual, riskDisplayCode } from "@/lib/risk";
import { ScoreBadge } from "@/components/risk-matrix";
import { LegalLinkItems, legalLinkSelect } from "@/components/legal-links";
import { AspectLinkItems, aspectLinkSelect } from "@/components/aspect-links";
import { Badge, Disclosure, Field, PageHeader, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { CheckboxPicker } from "@/components/checkbox-picker";
import { addRaci, createStep, deleteProcess, deleteStep, moveStep, removeRaci, setProcessLinks, setStepLinks, updateProcess, updateStep } from "../actions";
import { Form } from "@/components/form";

const RACI_ORDER: RaciType[] = ["R", "A", "C", "I"];

export default async function ProcessDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ stap?: string }> }) {
  const { id } = await params;
  const { stap } = await searchParams;
  const user = await requireUser();

  const process = await prisma.process.findUnique({
    where: { id },
    include: {
      discipline: true,
      owner: true,
      documents: { orderBy: { title: "asc" } },
      requirements: { include: { norm: true } },
      risks: { where: { status: { not: "CLOSED" } }, orderBy: { number: "asc" } },
      legalRequirements: { where: { active: true }, select: legalLinkSelect, orderBy: [{ externalRef: "asc" }, { number: "asc" }] },
      environmentalAspects: { where: { active: true }, select: aspectLinkSelect, orderBy: [{ significant: "desc" }, { number: "asc" }] },
      steps: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          raci: { include: { jobFunction: true, user: true }, orderBy: { createdAt: "asc" } },
          documents: { orderBy: { title: "asc" } },
          requirements: { include: { norm: true } },
        },
      },
    },
  });
  if (!process) notFound();
  await logAudit({ user, action: "VIEW", entityType: "Process", entityId: id });

  const canEdit = can(user.role, "processes.edit");
  const selected = process.steps.find((s) => s.id === stap) ?? null;

  const [lookups, requirementGroups, allDocuments] = canEdit
    ? await Promise.all([
        getLookups(),
        getRequirementOptions(),
        prisma.document.findMany({ orderBy: { title: "asc" }, select: { id: true, title: true, documentNumber: true } }),
      ])
    : [null, [], []];
  const documentGroups = [
    { label: "Documenten", options: allDocuments.map((d) => ({ value: d.id, label: d.documentNumber ? `${d.documentNumber} — ${d.title}` : d.title })) },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/processen", label: "Processen" }]}
        title={process.name}
        description={
          <>
            {process.code && <span className="mr-2 font-mono text-xs">{process.code}</span>}
            {process.discipline?.name ?? "Bedrijfsbreed"}
            {process.owner && <> · Proceseigenaar: {process.owner.name}</>}
          </>
        }
      />

      {(process.purpose || process.input || process.output || process.description) && (
        <div className="card mb-6 grid gap-4 text-sm md:grid-cols-3">
          {process.purpose && (
            <Info label="Doel" className="md:col-span-3">
              {process.purpose}
            </Info>
          )}
          {process.description && (
            <Info label="Omschrijving" className="md:col-span-3">
              {process.description}
            </Info>
          )}
          {process.input && <Info label="Input">{process.input}</Info>}
          {process.output && <Info label="Output">{process.output}</Info>}
        </div>
      )}

      {/* Processtappen in volgorde */}
      <h2 className="mb-3">Processtappen</h2>
      {process.steps.length === 0 ? (
        <p className="mb-4 text-sm text-neutral-500">Nog geen stappen.</p>
      ) : (
        <ol className="mb-4 flex flex-wrap items-stretch gap-2">
          {process.steps.map((s, i) => {
            const active = s.id === selected?.id;
            const a = s.raci.find((r) => r.type === "A");
            return (
              <li key={s.id} className="flex items-stretch gap-2">
                <Link
                  href={active ? `/processen/${id}` : `/processen/${id}?stap=${s.id}`}
                  scroll={false}
                  className={`block h-full w-48 rounded-md border p-3 text-inherit no-underline shadow-sm transition hover:no-underline ${
                    active ? "border-brand-red bg-brand-red text-white" : "border-neutral-200 bg-white hover:border-brand-red"
                  }`}
                  aria-current={active ? "step" : undefined}
                >
                  <div className={`text-xs font-semibold ${active ? "text-white/80" : "text-brand-red"}`}>Stap {i + 1}</div>
                  <div className="font-medium">{s.name}</div>
                  <div className={`mt-1 text-xs ${active ? "text-white/80" : "text-neutral-500"}`}>
                    {a ? `A: ${a.jobFunction?.name ?? a.user?.name}` : "Geen eindverantwoordelijke"}
                  </div>
                </Link>
                {i < process.steps.length - 1 && (
                  <span aria-hidden className="text-xl text-neutral-400">
                    →
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {canEdit && (
        <div className="mb-6">
          <Disclosure summary="Processtap toevoegen" open={process.steps.length === 0}>
            <Form action={createStep.bind(null, id)} className="grid gap-3 md:grid-cols-3">
              <Field label="Naam stap">
                <input name="name" required maxLength={200} className="input" />
              </Field>
              <Field label="Omschrijving" className="md:col-span-2">
                <input name="description" className="input" />
              </Field>
              <div>
                <SubmitButton>Stap toevoegen</SubmitButton>
              </div>
            </Form>
          </Disclosure>
        </div>
      )}

      {/* Detail van de gekozen stap */}
      {selected && (
        <section className="card mb-8 border-brand-red/40" aria-label={`Stap ${selected.name}`}>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-brand-red uppercase">Stap {process.steps.indexOf(selected) + 1}</div>
              <h2 className="text-xl">{selected.name}</h2>
              {selected.description && <p className="mt-1 text-sm text-neutral-600">{selected.description}</p>}
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <Form action={moveStep.bind(null, id, selected.id, "up")}>
                  <SubmitButton variant="secondary">← Eerder</SubmitButton>
                </Form>
                <Form action={moveStep.bind(null, id, selected.id, "down")}>
                  <SubmitButton variant="secondary">Later →</SubmitButton>
                </Form>
              </div>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 font-semibold">Eigenaarschap (RACI)</h3>
              <table className="table">
                <tbody>
                  {RACI_ORDER.map((t) => {
                    const items = selected.raci.filter((r) => r.type === t);
                    return (
                      <tr key={t}>
                        <td className="w-10">
                          <span className={`badge w-7 justify-center text-sm font-bold ${RACI_CLASS[t]}`} title={RACI_LABEL[t]}>
                            {t}
                          </span>
                        </td>
                        <td>
                          <div className="text-xs text-neutral-500">{RACI_LABEL[t]}</div>
                          {items.length === 0 ? (
                            <span className="text-neutral-400">—</span>
                          ) : (
                            <ul>
                              {items.map((r) => (
                                <li key={r.id} className="flex items-center gap-2">
                                  <span>
                                    {r.jobFunction ? r.jobFunction.name : r.user?.name}
                                    <span className="ml-1 text-xs text-neutral-500">({r.jobFunction ? "functie" : "persoon"})</span>
                                    {r.note && <span className="ml-1 text-xs text-neutral-500">— {r.note}</span>}
                                  </span>
                                  {canEdit && (
                                    <Form action={removeRaci.bind(null, id, r.id)}>
                                      <SubmitButton variant="link" className="text-xs">
                                        verwijderen
                                      </SubmitButton>
                                    </Form>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {canEdit && lookups && (
                <Form resetOnSuccess action={addRaci.bind(null, id, selected.id)} className="mt-3 grid gap-2 sm:grid-cols-[5rem_1fr_auto]">
                  <Select name="type" options={RACI_ORDER.map((t) => ({ value: t, label: t }))} />
                  <select name="assignee" required className="input" defaultValue="">
                    <option value="" disabled>
                      Functie of persoon…
                    </option>
                    <optgroup label="Functies">
                      {lookups.jobFunctions.map((f) => (
                        <option key={f.value} value={`f:${f.value}`}>
                          {f.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Personen">
                      {lookups.users.map((u) => (
                        <option key={u.value} value={`u:${u.value}`}>
                          {u.label}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <SubmitButton variant="secondary">Toevoegen</SubmitButton>
                </Form>
              )}
            </div>

            <div className="space-y-4">
              <LinkedList title="Documenten bij deze stap" empty="Geen documenten gekoppeld.">
                {selected.documents.map((d) => (
                  <li key={d.id}>
                    <Link href={`/documenten/${d.id}`}>{d.title}</Link>
                  </li>
                ))}
              </LinkedList>
              <LinkedList title="Normeisen" empty="Geen normeisen gekoppeld.">
                {selected.requirements.map((r) => (
                  <li key={r.id}>
                    <Link href={`/normen/${r.normId}/eisen/${r.id}`}>
                      <Badge className="mr-1 bg-brand-grey-light text-neutral-900">{r.norm.code}</Badge>
                      {r.clause} {r.title}
                    </Link>
                  </li>
                ))}
              </LinkedList>
            </div>
          </div>

          {canEdit && (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <Disclosure summary="Koppelingen van deze stap wijzigen">
                <Form action={setStepLinks.bind(null, id, selected.id)} className="space-y-3">
                  <Field label="Documenten" group>
                    <CheckboxPicker name="documentIds" groups={documentGroups} selected={selected.documents.map((d) => d.id)} height="10rem" />
                  </Field>
                  <Field label="Normeisen" group>
                    <CheckboxPicker
                      name="requirementIds"
                      groups={requirementGroups.map((g) => ({ label: g.norm, options: g.options }))}
                      selected={selected.requirements.map((r) => r.id)}
                    />
                  </Field>
                  <SubmitButton>Koppelingen opslaan</SubmitButton>
                </Form>
              </Disclosure>
              <Disclosure summary="Stap wijzigen of verwijderen">
                <Form key={`${selected.id}-${selected.updatedAt.toISOString()}`} action={updateStep.bind(null, id, selected.id)} className="space-y-3">
                  <Field label="Naam">
                    <input name="name" required defaultValue={selected.name} className="input" />
                  </Field>
                  <Field label="Omschrijving">
                    <textarea name="description" rows={3} defaultValue={selected.description ?? ""} className="input" />
                  </Field>
                  <SubmitButton>Opslaan</SubmitButton>
                </Form>
                <Form action={deleteStep.bind(null, id, selected.id)} className="mt-4 border-t border-neutral-200 pt-3">
                  <SubmitButton variant="link" confirm={`Stap "${selected.name}" verwijderen, inclusief RACI?`}>
                    Stap verwijderen
                  </SubmitButton>
                </Form>
              </Disclosure>
            </div>
          )}
        </section>
      )}

      {/* Proces-niveau */}
      <div className="grid gap-4 lg:grid-cols-2">
        <LinkedList card title="Documenten bij dit proces" empty="Geen documenten gekoppeld.">
          {process.documents.map((d) => (
            <li key={d.id}>
              <Link href={`/documenten/${d.id}`}>{d.title}</Link>
            </li>
          ))}
        </LinkedList>
        <LinkedList card title="Normeisen bij dit proces" empty="Geen normeisen gekoppeld.">
          {process.requirements.map((r) => (
            <li key={r.id}>
              <Link href={`/normen/${r.normId}/eisen/${r.id}`}>
                <Badge className="mr-1 bg-brand-grey-light text-neutral-900">{r.norm.code}</Badge>
                {r.clause} {r.title}
              </Link>
            </li>
          ))}
        </LinkedList>
      </div>

      <section className="card mt-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="font-semibold">Risico&apos;s en kansen bij dit proces</h3>
          <Link href={`/risicos?proces=${id}`} className="text-sm">
            In het register →
          </Link>
        </div>
        {process.risks.length === 0 ? (
          <p className="text-sm text-neutral-500">Geen (open) risico&apos;s of kansen gekoppeld.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {process.risks.map((r) => {
              const res = residual(r);
              return (
                <li key={r.id} className="flex items-center gap-2">
                  <ScoreBadge likelihood={res.likelihood} impact={res.impact} type={r.type} />
                  <Link href={`/risicos/${r.id}`}>
                    {riskDisplayCode(r)} {r.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card mt-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="font-semibold">Wet- en regelgeving bij dit proces</h3>
          <Link href="/wetgeving" className="text-sm">
            Register →
          </Link>
        </div>
        {process.legalRequirements.length === 0 ? (
          <p className="text-sm text-neutral-500">Geen wettelijke eisen gekoppeld.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            <LegalLinkItems items={process.legalRequirements} />
          </ul>
        )}
      </section>

      <section className="card mt-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="font-semibold">Milieuaspecten bij dit proces</h3>
          <Link href={`/milieuaspecten?proces=${id}`} className="text-sm">
            In het register →
          </Link>
        </div>
        {process.environmentalAspects.length === 0 ? (
          <p className="text-sm text-neutral-500">Geen milieuaspecten gekoppeld.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            <AspectLinkItems items={process.environmentalAspects} moreHref={`/milieuaspecten?proces=${id}`} />
          </ul>
        )}
      </section>

      {canEdit && lookups && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Disclosure summary="Koppelingen van het proces wijzigen">
            <Form action={setProcessLinks.bind(null, id)} className="space-y-3">
              <Field label="Documenten" group>
                <CheckboxPicker name="documentIds" groups={documentGroups} selected={process.documents.map((d) => d.id)} height="10rem" />
              </Field>
              <Field label="Normeisen" group>
                <CheckboxPicker
                  name="requirementIds"
                  groups={requirementGroups.map((g) => ({ label: g.norm, options: g.options }))}
                  selected={process.requirements.map((r) => r.id)}
                />
              </Field>
              <SubmitButton>Koppelingen opslaan</SubmitButton>
            </Form>
          </Disclosure>
          <Disclosure summary="Proces wijzigen">
            <Form key={process.updatedAt.toISOString()} action={updateProcess.bind(null, id)} className="grid gap-3 sm:grid-cols-2">
              <Field label="Naam" className="sm:col-span-2">
                <input name="name" required defaultValue={process.name} className="input" />
              </Field>
              <Field label="Code">
                <input name="code" defaultValue={process.code ?? ""} className="input" />
              </Field>
              <Field label="Volgorde">
                <input name="sortOrder" type="number" defaultValue={process.sortOrder} className="input" />
              </Field>
              <Field label="Discipline">
                <Select name="disciplineId" options={lookups.disciplines} defaultValue={process.disciplineId} placeholder="Bedrijfsbreed" />
              </Field>
              <Field label="Proceseigenaar">
                <Select name="ownerId" options={lookups.users} defaultValue={process.ownerId} placeholder="— Kies —" />
              </Field>
              <Field label="Doel" className="sm:col-span-2">
                <textarea name="purpose" rows={2} defaultValue={process.purpose ?? ""} className="input" />
              </Field>
              <Field label="Omschrijving" className="sm:col-span-2">
                <textarea name="description" rows={2} defaultValue={process.description ?? ""} className="input" />
              </Field>
              <Field label="Input">
                <textarea name="input" rows={2} defaultValue={process.input ?? ""} className="input" />
              </Field>
              <Field label="Output">
                <textarea name="output" rows={2} defaultValue={process.output ?? ""} className="input" />
              </Field>
              <div className="sm:col-span-2">
                <SubmitButton>Opslaan</SubmitButton>
              </div>
            </Form>
            <Form action={deleteProcess.bind(null, id)} className="mt-4 border-t border-neutral-200 pt-3">
              <SubmitButton variant="link" confirm={`Proces "${process.name}" met alle stappen verwijderen?`}>
                Proces verwijderen
              </SubmitButton>
            </Form>
          </Disclosure>
        </div>
      )}
    </>
  );
}

function Info({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">{label}</div>
      <div className="mt-0.5 whitespace-pre-line">{children}</div>
    </div>
  );
}

function LinkedList({ title, empty, children, card }: { title: string; empty: string; children: React.ReactNode[]; card?: boolean }) {
  return (
    <div className={card ? "card" : ""}>
      <h3 className="mb-2 font-semibold">{title}</h3>
      {children.length ? <ul className="space-y-1 text-sm">{children}</ul> : <p className="text-sm text-neutral-500">{empty}</p>}
    </div>
  );
}
