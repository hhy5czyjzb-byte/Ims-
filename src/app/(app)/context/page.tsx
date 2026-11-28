import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { can } from "@/lib/rbac";
import { formatDate, isOverdue, toDateInput } from "@/lib/format";
import { getAnalysis, getFactorLinks } from "@/lib/context-data";
import { sanitizeContextHtml } from "@/lib/context-import";
import { CONTEXT_STATUS_CLASS, CONTEXT_STATUS_LABEL } from "@/lib/labels";
import { Badge, Disclosure, EmptyState, Field, PageHeader } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { ContextNav } from "@/components/context-nav";
import { RichTextEditor } from "@/components/rich-text-editor";
import { PrintButton } from "@/components/print-button";
import { addSectionAfter, approveContextAnalysis, createDraftFromAnalysis, deleteSection, updateSection, uploadSectionImage } from "./actions";

export const metadata = { title: "Context en stakeholders" };

export default async function ContextPage({ searchParams }: { searchParams: Promise<{ versie?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const analysis = await getAnalysis(sp.versie);
  const canEdit = can(user.role, "context.edit");
  const canApprove = can(user.role, "context.approve");

  if (!analysis) {
    return (
      <>
        <PageHeader
          title="Context en stakeholders"
          description="Context- en stakeholderanalyse (ISO 9001 en ISO 14001 §4.1 en §4.2, CO2-prestatieladder, VCA)."
        />
        <ContextNav />
        <EmptyState>
          Nog geen analyse ingelezen.
          {canEdit && (
            <>
              {" "}
              Lees het Word-document in via <Link href="/context/versies">Versies</Link>.
            </>
          )}
        </EmptyState>
      </>
    );
  }
  await logAudit({ user, action: "VIEW", entityType: "ContextAnalysis", entityId: analysis.id });

  const [sections, factors, links, stakeholderCount, obligationCount, current, newerConcept] = await Promise.all([
    prisma.contextSection.findMany({ where: { analysisId: analysis.id }, orderBy: { sortOrder: "asc" } }),
    prisma.contextFactor.findMany({ where: { active: true } }),
    getFactorLinks(),
    prisma.stakeholder.count({ where: { active: true } }),
    prisma.stakeholderObligation.count(),
    getAnalysis(),
    prisma.contextAnalysis.findFirst({
      where: { status: "CONCEPT", createdAt: { gt: analysis.createdAt } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
  ]);
  const editable = canEdit && analysis.status === "CONCEPT";
  const factorBySection = new Map(factors.filter((f) => f.sectionNumber).map((f) => [f.sectionNumber!, f]));
  const isCurrent = current?.id === analysis.id;
  const late = analysis.status === "APPROVED" && isOverdue(analysis.nextReviewDate);

  // Inhoudsopgave per deel
  const parts: { part: number; title: string | null; items: typeof sections }[] = [];
  for (const s of sections) {
    const last = parts[parts.length - 1];
    if (!last || last.part !== s.part) parts.push({ part: s.part, title: s.part === 0 ? "Inleiding" : s.partTitle, items: [s] });
    else last.items.push(s);
  }

  const crossLink = (s: (typeof sections)[number]) => {
    const f = s.number ? factorBySection.get(s.number) : undefined;
    if (f) {
      const l = links.get(f.name) ?? { risks: 0, opportunities: 0, strategic: 0, aspects: 0, significantAspects: 0 };
      return (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
          <span>
            Contextfactor{" "}
            <Link href={`/context/factoren/${f.id}`} className="font-medium">
              {f.name}
            </Link>
            {f.importance && ` · belang ${f.importance.toLowerCase()}`}
            {f.character && ` · ${f.character.toLowerCase()}`}
          </span>
          <Link href={`/risicos?context=${encodeURIComponent(f.name)}`}>
            {l.risks} risico&apos;s, {l.opportunities} kansen{l.strategic ? ` (${l.strategic} ★)` : ""}
          </Link>
          <Link href={`/milieuaspecten?context=${encodeURIComponent(f.name)}&werking=ja`}>
            {l.aspects} milieuaspecten{l.significantAspects ? ` (${l.significantAspects} significant)` : ""}
          </Link>
        </div>
      );
    }
    const hint: Record<string, React.ReactNode> = {
      "5.1": <Link href="/context/stakeholders">Stakeholderregister ({stakeholderCount}) →</Link>,
      "5.2": <Link href="/context/stakeholders#verplichtingen">Verplichtingen ({obligationCount}) en koppeling met wet- en regelgeving →</Link>,
      "6.2": <Link href="/risicos?prioriteit=1&soort=RISK">Strategische risico&apos;s in het risico- en kansenregister →</Link>,
      "6.3": <Link href="/risicos?prioriteit=1&soort=OPPORTUNITY">Strategische kansen in het risico- en kansenregister →</Link>,
      "7.3": <Link href="/milieuaspecten">Uitgewerkt in het milieuaspectenregister (MAR) →</Link>,
    };
    const h = s.number ? (
      hint[s.number]
    ) : s.title === "Overzicht contextfactoren" ? (
      <Link href="/context/factoren">Contextfactoren met koppelingen →</Link>
    ) : null;
    return h ? <div className="mb-3 rounded-md bg-neutral-50 px-3 py-2 text-xs">{h}</div> : null;
  };

  return (
    <>
      <PageHeader
        title="Context en stakeholders"
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{analysis.title}</span>
            {analysis.versionLabel && <span className="text-neutral-500">versie {analysis.versionLabel}</span>}
            <Badge className={CONTEXT_STATUS_CLASS[analysis.status]}>{CONTEXT_STATUS_LABEL[analysis.status]}</Badge>
          </span>
        }
        actions={
          <>
            <PrintButton />
            {analysis.sharepointUrl && (
              <a href={analysis.sharepointUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary print:hidden">
                Openen in SharePoint ↗
              </a>
            )}
          </>
        }
      />
      <ContextNav />

      {!isCurrent && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Je bekijkt een {analysis.status === "CONCEPT" ? "conceptversie" : "eerdere versie"} ({analysis.fileName}, ingelezen {formatDate(analysis.createdAt)}).{" "}
          <Link href="/context">Naar de actuele versie</Link>
        </p>
      )}

      <section className="card mb-6 text-sm">
        {canEdit && analysis.status !== "CONCEPT" && (
          <div className="mb-3 flex flex-wrap items-center gap-3 border-b border-neutral-100 pb-3 print:hidden">
            {newerConcept ? (
              <Link href={`/context?versie=${newerConcept.id}`} className="btn-secondary">
                Naar de conceptversie in bewerking →
              </Link>
            ) : (
              <Form action={createDraftFromAnalysis.bind(null, analysis.id)}>
                <SubmitButton variant="secondary">Wijzigen (nieuwe conceptversie maken)</SubmitButton>
              </Form>
            )}
            <span className="text-xs text-neutral-500">
              Een vastgestelde versie blijft ongewijzigd als bewijs. Je bewerkt een kopie; na vaststelling vervangt die deze versie.
            </span>
          </div>
        )}
        {editable && (
          <p className="mb-3 rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-900 print:hidden">
            Conceptversie: je kunt elke paragraaf bewerken, toevoegen of verwijderen. Laat de versie daarna vaststellen. Het Word-document in SharePoint wordt
            niet automatisch bijgewerkt; gebruik &ldquo;Afdrukken / PDF&rdquo; of werk het Word-bestand bij.
          </p>
        )}
        <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
          <div className="grid grid-cols-[10rem_1fr] gap-y-1">
            <span className="text-neutral-500">Status</span>
            <span>
              {analysis.status === "APPROVED"
                ? `Vastgesteld op ${formatDate(analysis.approvedAt)}${analysis.approvedByText ? ` door ${analysis.approvedByText}` : ""}`
                : CONTEXT_STATUS_LABEL[analysis.status]}
            </span>
            <span className="text-neutral-500">Eigenaar</span>
            <span>{analysis.ownerText ?? "—"}</span>
            <span className="text-neutral-500">Herzieningscyclus</span>
            <span>{analysis.reviewCycle ?? "—"}</span>
          </div>
          <div className="grid grid-cols-[10rem_1fr] gap-y-1">
            <span className="text-neutral-500">Volgende herbeoordeling</span>
            <span className={late ? "font-semibold text-brand-red" : ""}>
              {formatDate(analysis.nextReviewDate)}
              {late && " ⚠ verlopen"}
            </span>
            <span className="text-neutral-500">Bronbestand</span>
            <span>
              {analysis.fileName} · ingelezen {formatDate(analysis.createdAt)}
              {analysis.uploadedBy && ` door ${analysis.uploadedBy.name}`}
            </span>
          </div>
        </div>
        {canApprove && analysis.status !== "APPROVED" && (
          <div className="mt-3 border-t border-neutral-100 pt-3 print:hidden">
            <Disclosure summary="Deze versie vaststellen">
              <Form action={approveContextAnalysis.bind(null, analysis.id)} className="flex flex-wrap items-end gap-3">
                <Field label="Vastgesteld op">
                  <input name="approvedAt" type="date" required defaultValue={toDateInput(new Date())} max={toDateInput(new Date())} className="input" />
                </Field>
                <Field label="Vastgesteld door">
                  <input name="approvedByText" defaultValue={analysis.approvedByText ?? "Directie"} maxLength={200} className="input w-64" />
                </Field>
                <SubmitButton>Vaststellen</SubmitButton>
              </Form>
              <p className="mt-2 text-xs text-neutral-500">
                De vorige vastgestelde versie krijgt de status &lsquo;vervangen&rsquo;. Volgende herbeoordeling: over 12 maanden.
              </p>
            </Disclosure>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[15rem_1fr] print:block">
        <nav className="text-sm print:hidden lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto" aria-label="Inhoud">
          <div className="mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Inhoud</div>
          <ol className="space-y-2">
            {parts.map((p) => (
              <li key={p.part}>
                <div className="font-medium text-neutral-800">
                  {p.part > 0 && <span className="text-neutral-400">Deel {p.part} · </span>}
                  {p.title}
                </div>
                <ul className="mt-0.5 space-y-0.5 border-l border-neutral-200 pl-2">
                  {p.items
                    .filter((s) => !(s.number === null && s.part > 0 && s.title === p.title))
                    .map((s) => (
                      <li key={s.id}>
                        <a href={`#${s.anchor}`} className="text-neutral-600 no-underline hover:text-brand-red-dark">
                          {s.number && <span className="tabular-nums">{s.number} </span>}
                          {s.title}
                        </a>
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ol>
        </nav>

        <article className="min-w-0 space-y-6">
          {parts.map((p) => (
            <div key={p.part} className="space-y-4">
              {p.part > 0 && (
                <div className="flex flex-wrap items-center gap-4 rounded-lg bg-brand-red px-5 py-3 text-white">
                  <div className="text-center leading-tight">
                    <div className="text-xs tracking-wide uppercase opacity-80">Deel</div>
                    <div className="text-2xl font-bold">{p.part}</div>
                  </div>
                  <div className="flex-1">
                    <div className="text-lg font-semibold">{p.items[0].partTitle}</div>
                    {p.items[0].partSubtitle && <div className="text-sm opacity-90">{p.items[0].partSubtitle}</div>}
                  </div>
                  {p.items[0].partKern && <div className="text-sm opacity-90">Kern: {p.items[0].partKern}</div>}
                </div>
              )}
              {p.items.map((s) => (
                <section key={s.id} id={s.anchor} className="card scroll-mt-4">
                  {!(s.number === null && s.part > 0 && s.title === p.title) && (
                    <h2 className="mb-2">
                      {s.number && <span className="mr-2 text-neutral-400 tabular-nums">{s.number}</span>}
                      {s.title}
                    </h2>
                  )}
                  {crossLink(s)}
                  {/* Opgeschoond bij het inlezen én bij het tonen (veilig, ook als de database later zou zijn aangepast). */}
                  <div className="doc" dangerouslySetInnerHTML={{ __html: sanitizeContextHtml(s.html) }} />
                  {editable && (
                    <div className="mt-4 grid gap-3 border-t border-neutral-100 pt-3 print:hidden">
                      <Disclosure summary="Paragraaf bewerken">
                        <Form
                          key={`${s.id}-${s.title}-${s.html.length}`}
                          action={updateSection.bind(null, s.id)}
                          className="grid gap-3 md:grid-cols-[8rem_1fr]"
                        >
                          <Field label="Nummer">
                            <input name="number" defaultValue={s.number ?? ""} maxLength={20} className="input" placeholder="Bijv. 3.1" />
                          </Field>
                          <Field label="Titel">
                            <input name="title" required defaultValue={s.title} maxLength={300} className="input" />
                          </Field>
                          <div className="md:col-span-2">
                            <RichTextEditor name="html" defaultValue={sanitizeContextHtml(s.html)} onUploadImage={uploadSectionImage.bind(null, analysis.id)} />
                          </div>
                          <div className="flex flex-wrap items-center gap-4 md:col-span-2">
                            <SubmitButton>Paragraaf opslaan</SubmitButton>
                          </div>
                        </Form>
                        <Form action={deleteSection.bind(null, s.id)} className="mt-3">
                          <SubmitButton variant="link" confirm={`Paragraaf "${s.title}" verwijderen?`}>
                            Paragraaf verwijderen
                          </SubmitButton>
                        </Form>
                      </Disclosure>
                      <Disclosure summary="Paragraaf hierna toevoegen">
                        <Form action={addSectionAfter.bind(null, s.id)} resetOnSuccess className="grid gap-3 md:grid-cols-[8rem_1fr]">
                          <Field label="Nummer">
                            <input name="number" maxLength={20} className="input" />
                          </Field>
                          <Field label="Titel">
                            <input name="title" required maxLength={300} className="input" />
                          </Field>
                          <div className="md:col-span-2">
                            <RichTextEditor name="html" defaultValue="" onUploadImage={uploadSectionImage.bind(null, analysis.id)} />
                          </div>
                          <div className="md:col-span-2">
                            <SubmitButton>Toevoegen</SubmitButton>
                          </div>
                        </Form>
                      </Disclosure>
                    </div>
                  )}
                </section>
              ))}
            </div>
          ))}
        </article>
      </div>
    </>
  );
}
