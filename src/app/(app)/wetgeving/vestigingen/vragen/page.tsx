import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { legalDisplayCode } from "@/lib/compliance";
import { Badge, Disclosure, EmptyState, Field, PageHeader, Select } from "@/components/ui";
import { Form } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import { LegalNav } from "@/components/legal-nav";
import { createQuestion, deleteQuestion, updateQuestion } from "../actions";

export const metadata = { title: "Auditvragen" };

export default async function QuestionsPage() {
  const user = await requireUser();
  const canEdit = can(user.role, "legal.edit");
  const [questions, legal] = await Promise.all([
    prisma.complianceQuestion.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { legalRequirement: { select: { id: true, number: true, externalRef: true, title: true } }, _count: { select: { answers: true } } },
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
  const active = questions.filter((q) => q.active).length;

  return (
    <>
      <PageHeader
        title="Wet- en regelgeving"
        description={`Vragenbank voor de compliance-audit per vestiging: ${active} actieve vragen. Elke nieuwe audit krijgt de actieve vragen als checklist; wijzigingen hier veranderen afgeronde audits niet.`}
      />
      <LegalNav />

      {canEdit && (
        <div className="mb-6">
          <Disclosure summary="Vraag toevoegen">
            <QuestionFields formAction={createQuestion} legalOptions={legalOptions} submitLabel="Toevoegen" reset />
          </Disclosure>
        </div>
      )}

      <section className="card">
        {questions.length === 0 ? (
          <EmptyState>
            Nog geen auditvragen.
            {canEdit && (
              <>
                {" "}
                Voeg ze hierboven toe of <Link href="/wetgeving/vestigingen/import">importeer het tabblad Compliance-audit</Link>.
              </>
            )}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-16">Volgorde</th>
                  <th className="w-56">Verplichting</th>
                  <th>Auditvraag</th>
                  <th className="w-40">Thema</th>
                  <th className="w-20 text-center">Gebruikt</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((q) => (
                  <tr key={q.id} className={q.active ? "" : "opacity-50"}>
                    <td className="tabular-nums">{q.sortOrder}</td>
                    <td className="text-xs">
                      {q.legalRequirement ? (
                        <Link href={`/wetgeving/${q.legalRequirement.id}`}>
                          <span className="font-mono">{legalDisplayCode(q.legalRequirement)}</span> {q.legalRequirement.title}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <div>
                        {q.question} {!q.active && <Badge className="bg-neutral-100 text-neutral-600">Niet actief</Badge>}
                      </div>
                      {q.evidenceHint && <div className="text-xs text-neutral-500">Bewijs: {q.evidenceHint}</div>}
                      {canEdit && (
                        <div className="mt-2">
                          <Disclosure compact summary="Wijzigen">
                            <QuestionFields
                              key={q.updatedAt.toISOString()}
                              formAction={updateQuestion.bind(null, q.id)}
                              legalOptions={legalOptions}
                              question={q}
                              submitLabel="Opslaan"
                            />
                            <Form action={deleteQuestion.bind(null, q.id)} className="mt-3 border-t border-neutral-200 pt-2">
                              <SubmitButton variant="link" confirm="Deze vraag verwijderen?">
                                Verwijderen
                              </SubmitButton>
                            </Form>
                          </Disclosure>
                        </div>
                      )}
                    </td>
                    <td className="text-xs">{q.theme ?? "—"}</td>
                    <td className="text-center tabular-nums text-neutral-500">{q._count.answers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function QuestionFields({
  formAction,
  legalOptions,
  question,
  submitLabel,
  reset,
}: {
  formAction: (formData: FormData) => Promise<{ error?: string } | void>;
  legalOptions: { value: string; label: string }[];
  question?: { question: string; evidenceHint: string | null; theme: string | null; legalRequirementId: string | null; sortOrder: number; active: boolean };
  submitLabel: string;
  reset?: boolean;
}) {
  return (
    <Form action={formAction} resetOnSuccess={reset} className="grid gap-3 md:grid-cols-4">
      <Field label="Auditvraag" className="md:col-span-4">
        <textarea name="question" required rows={2} maxLength={1000} defaultValue={question?.question} className="input" />
      </Field>
      <Field label="Bewijs om te bekijken" className="md:col-span-2">
        <input name="evidenceHint" maxLength={1000} defaultValue={question?.evidenceHint ?? ""} className="input" />
      </Field>
      <Field label="Wettelijke eis" className="md:col-span-2">
        <Select name="legalRequirementId" options={legalOptions} defaultValue={question?.legalRequirementId} placeholder="— Geen —" />
      </Field>
      <Field label="Thema" hint="Leeg = thema van de wettelijke eis">
        <input name="theme" maxLength={200} defaultValue={question?.theme ?? ""} className="input" />
      </Field>
      <Field label="Volgorde" hint="Leeg = achteraan">
        <input name="sortOrder" type="number" min={0} defaultValue={question?.sortOrder ?? ""} className="input" />
      </Field>
      {question && (
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={question.active} /> Actief
        </label>
      )}
      <div className="self-end">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </Form>
  );
}
