import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { formatDateTime } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/labels";
import { Badge, Field, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createBackupNow, createMasterData, deleteJobFunction, toggleActive } from "./actions";
import { backupDir, keepCount, listBackups } from "@/lib/backup";
import { localMode } from "@/lib/env";
import { Form } from "@/components/form";

export const metadata = { title: "Stamgegevens" };

export default async function MasterDataPage() {
  const user = await requireUser();
  const canEdit = can(user.role, "masterdata.edit");
  const showBackups = localMode && can(user.role, "backup.manage");
  const backups = showBackups ? listBackups().slice(0, 8) : [];
  const [locations, disciplines, functions, users] = await Promise.all([
    prisma.location.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.discipline.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.jobFunction.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { raciAssignments: true } } } }),
    prisma.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] }),
  ]);

  return (
    <>
      <PageHeader
        title="Stamgegevens"
        description="Locaties, disciplines en functies die in het hele systeem terugkomen."
        actions={
          can(user.role, "auditlog.view") ? (
            <Link href="/beheer/logboek" className="btn-secondary">
              Logboek (audit trail)
            </Link>
          ) : undefined
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card">
          <div className="mb-3 flex items-baseline justify-between">
            <h2>Locaties</h2>
            {canEdit && (
              <Link href="/beheer/vestigingen-import" className="text-sm">
                Importeren uit Excel
              </Link>
            )}
          </div>
          <ul className="mb-4 divide-y divide-neutral-100 text-sm">
            {locations.map((l) => (
              <li key={l.id} className="flex items-center justify-between py-1.5">
                <span className={l.active ? "" : "text-neutral-400 line-through"}>
                  {l.name}
                  {(l.address || l.city) && <span className="block text-xs text-neutral-500">{[l.address, l.city].filter(Boolean).join(", ")}</span>}
                  {l.energySavingObligation && <span className="block text-xs text-neutral-400">Energiebesparingsplicht: {l.energySavingObligation}</span>}
                </span>
                {canEdit && (
                  <Form action={toggleActive.bind(null, "location", l.id)}>
                    <SubmitButton variant="link" className="text-xs">
                      {l.active ? "Deactiveren" : "Activeren"}
                    </SubmitButton>
                  </Form>
                )}
              </li>
            ))}
          </ul>
          {canEdit && (
            <Form resetOnSuccess action={createMasterData.bind(null, "location")} className="space-y-2 border-t border-neutral-200 pt-3">
              <Field label="Nieuwe locatie">
                <input name="name" required className="input" />
              </Field>
              <input name="address" placeholder="Adres (optioneel)" className="input" />
              <SubmitButton variant="secondary">Toevoegen</SubmitButton>
            </Form>
          )}
        </section>

        <section className="card">
          <h2 className="mb-3">Disciplines</h2>
          <ul className="mb-4 divide-y divide-neutral-100 text-sm">
            {disciplines.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-1.5">
                <span className={d.active ? "" : "text-neutral-400 line-through"}>{d.name}</span>
                {canEdit && (
                  <Form action={toggleActive.bind(null, "discipline", d.id)}>
                    <SubmitButton variant="link" className="text-xs">
                      {d.active ? "Deactiveren" : "Activeren"}
                    </SubmitButton>
                  </Form>
                )}
              </li>
            ))}
          </ul>
          {canEdit && (
            <Form resetOnSuccess action={createMasterData.bind(null, "discipline")} className="space-y-2 border-t border-neutral-200 pt-3">
              <Field label="Nieuwe discipline">
                <input name="name" required className="input" />
              </Field>
              <SubmitButton variant="secondary">Toevoegen</SubmitButton>
            </Form>
          )}
        </section>

        <section className="card">
          <h2 className="mb-3">Functies (voor RACI)</h2>
          <ul className="mb-4 divide-y divide-neutral-100 text-sm">
            {functions.map((f) => (
              <li key={f.id} className="flex items-center justify-between py-1.5">
                <span>
                  {f.name}
                  <span className="ml-1 text-xs text-neutral-500">({f._count.raciAssignments}× in RACI)</span>
                </span>
                {canEdit && f._count.raciAssignments === 0 && (
                  <Form action={deleteJobFunction.bind(null, f.id)}>
                    <SubmitButton variant="link" className="text-xs" confirm={`Functie "${f.name}" verwijderen?`}>
                      Verwijderen
                    </SubmitButton>
                  </Form>
                )}
              </li>
            ))}
          </ul>
          {canEdit && (
            <Form resetOnSuccess action={createMasterData.bind(null, "jobFunction")} className="space-y-2 border-t border-neutral-200 pt-3">
              <Field label="Nieuwe functie">
                <input name="name" required className="input" />
              </Field>
              <input name="description" placeholder="Omschrijving (optioneel)" className="input" />
              <SubmitButton variant="secondary">Toevoegen</SubmitButton>
            </Form>
          )}
        </section>
      </div>

      {showBackups && (
        <section className="card mt-6">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2>Back-ups</h2>
              <p className="text-sm text-neutral-600">
                Map: <code className="text-xs">{backupDir()}</code> · de nieuwste {keepCount()} blijven bewaard. Elke back-up wordt direct teruggezet in een
                tijdelijke database en gecontroleerd (hersteltest).
              </p>
            </div>
            <Form action={createBackupNow}>
              <SubmitButton>Nu back-up maken</SubmitButton>
            </Form>
          </div>
          {backups.length === 0 ? (
            <p className="text-sm font-medium text-brand-red">Er is nog geen back-up gemaakt.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Back-up</th>
                  <th>Gemaakt</th>
                  <th className="text-right">Grootte</th>
                  <th>Hersteltest</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.name}>
                    <td className="font-mono text-xs">{b.name}</td>
                    <td className="whitespace-nowrap">{formatDateTime(b.createdAt)}</td>
                    <td className="text-right whitespace-nowrap tabular-nums">{(b.sizeBytes / 1024 / 1024).toFixed(2).replace(".", ",")} MB</td>
                    <td className="text-sm">
                      {b.verify ? (
                        b.verify.ok ? (
                          <Badge className="bg-green-100 text-green-800">Geslaagd</Badge>
                        ) : (
                          <span className="text-brand-red" title={b.verify.message}>
                            Niet geslaagd
                          </span>
                        )
                      ) : (
                        <span className="text-neutral-400">{b.label === "voor-herstel" ? "veiligheidskopie vóór herstel" : "niet getest"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <details className="mt-3 text-sm text-neutral-600">
            <summary className="cursor-pointer text-brand-red-dark">Automatisch dagelijks en terugzetten</summary>
            <div className="mt-2 space-y-2">
              <p>
                Dagelijkse back-up op Windows (Taakplanner), eenmalig in een opdrachtprompt in de projectmap:{" "}
                <code className="text-xs">npm run backup:plan</code>. Of handmatig: <code className="text-xs">npm run backup</code>.
              </p>
              <p>
                Terugzetten: stop de app en voer uit <code className="text-xs">npm run backup:herstel -- &lt;bestandsnaam&gt;</code>. Er wordt eerst automatisch
                een veiligheidskopie van de huidige stand gemaakt.
              </p>
              <p>Tip: zet BACKUP_DIR in .env op een map in OneDrive, dan staat er ook een kopie buiten de laptop.</p>
            </div>
          </details>
        </section>
      )}

      <section className="card mt-6">
        <h2 className="mb-1">Gebruikers</h2>
        <p className="mb-3 text-sm text-neutral-600">
          Gebruikers en rollen worden beheerd in Microsoft 365 (Entra ID-groepen) en hier bij elke login overgenomen. Wijzigen kan alleen in Microsoft 365.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Naam</th>
              <th>E-mail</th>
              <th>Rol</th>
              <th>Laatste login</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td className="text-neutral-600">{u.email}</td>
                <td>
                  <Badge className={u.role === "QHSE" ? "bg-brand-red text-white" : u.role === "DIRECTIE" ? "bg-neutral-800 text-white" : undefined}>
                    {ROLE_LABEL[u.role]}
                  </Badge>
                </td>
                <td className="text-neutral-600">{formatDateTime(u.lastLoginAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
