import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { can } from "@/lib/rbac";
import { formatDateTime } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/labels";
import { Field, PageHeader, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { Form } from "@/components/form";
import { updateUserMasterData } from "../../actions";

export const metadata = { title: "Gebruiker" };

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const canEdit = can(user.role, "masterdata.edit");
  const [u, functions] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: { jobFunction: true, _count: { select: { ownedActions: true, ownedRisks: true, ownedProcesses: true, ownedLegalRequirements: true } } },
    }),
    prisma.jobFunction.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!u) notFound();
  await logAudit({ user, action: "VIEW", entityType: "User", entityId: u.id, summary: `Gebruiker "${u.name}" bekeken` });
  return (
    <>
      <PageHeader
        title={u.name}
        description={`${u.email} · ${ROLE_LABEL[u.role]} · laatste login ${formatDateTime(u.lastLoginAt)}`}
        breadcrumb={[
          { href: "/beheer", label: "Stamgegevens" },
          { href: "/beheer/gebruikers", label: "Gebruikers" },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          {canEdit ? (
            <Form key={u.updatedAt.toISOString()} action={updateUserMasterData.bind(null, id)} className="space-y-3">
              <Field label="Naam" hint="Bij een Microsoft 365-login wordt de naam uit Microsoft 365 overgenomen.">
                <input name="name" required defaultValue={u.name} className="input" />
              </Field>
              <Field label="Functie">
                <Select
                  name="jobFunctionId"
                  defaultValue={u.jobFunctionId}
                  placeholder="Geen"
                  options={functions.map((f) => ({ value: f.id, label: f.name }))}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={u.active} /> Actief (niet actief = verdwijnt uit keuzelijsten voor eigenaar)
              </label>
              <p className="text-xs text-neutral-500">De rol wijzig je in Microsoft 365 (Entra ID-groep).</p>
              <SubmitButton>Opslaan</SubmitButton>
            </Form>
          ) : (
            <p className="text-sm">Functie: {u.jobFunction?.name ?? "—"}</p>
          )}
        </section>
        <aside className="card text-sm">
          <h2 className="mb-2">Eigenaar van</h2>
          <ul className="divide-y divide-neutral-100">
            {[
              ["Acties", u._count.ownedActions],
              ["Risico's en kansen", u._count.ownedRisks],
              ["Processen", u._count.ownedProcesses],
              ["Wettelijke eisen", u._count.ownedLegalRequirements],
            ].map(([k, v]) => (
              <li key={k} className="flex justify-between py-1.5">
                <span>{k}</span>
                <span className="tabular-nums">{v}</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </>
  );
}
