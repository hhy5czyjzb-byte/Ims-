import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { formatDateTime } from "@/lib/format";
import { Badge, PageHeader } from "@/components/ui";
import { BeheerNav } from "./beheer-nav";
import { SubmitButton } from "@/components/submit-button";
import { createBackupNow } from "./actions";
import { backupDir, keepCount, listBackups } from "@/lib/backup";
import { localMode } from "@/lib/env";
import { Form } from "@/components/form";

export const metadata = { title: "Stamgegevens" };

export default async function MasterDataPage() {
  const user = await requireUser();
  const canEdit = can(user.role, "masterdata.edit");
  const showBackups = localMode && can(user.role, "backup.manage");
  const backups = showBackups ? listBackups().slice(0, 8) : [];
  const [locations, locNoAddress, disciplines, functions, users, norms, auditCount] = await Promise.all([
    prisma.location.count({ where: { active: true } }),
    prisma.location.count({ where: { active: true, address: null } }),
    prisma.discipline.count({ where: { active: true } }),
    prisma.jobFunction.count(),
    prisma.user.count({ where: { active: true } }),
    prisma.norm.count(),
    prisma.auditLog.count(),
  ]);
  const tiles: { href: string; title: string; value: string; text: string; warn?: string; show?: boolean }[] = [
    {
      href: "/beheer/vestigingen",
      title: "Vestigingen",
      value: String(locations),
      text: "Adres, soort, manager, activiteiten, vergunningen, energiebesparingsplicht.",
      warn: locNoAddress ? `${locNoAddress} zonder adres` : undefined,
    },
    { href: "/beheer/bedrijfsonderdelen", title: "Bedrijfsonderdelen", value: String(disciplines), text: "BU's met manager en andere namen voor de import." },
    { href: "/beheer/functies", title: "Functies", value: String(functions), text: "Voor de RACI en als functie van gebruikers." },
    { href: "/beheer/gebruikers", title: "Gebruikers", value: String(users), text: "Functie toewijzen, (de)activeren; rol uit Microsoft 365." },
    { href: "/normen", title: "Normen", value: String(norms), text: "Normen en eisen toevoegen, wijzigen en verwijderen." },
    { href: "/milieuaspecten/significantie", title: "Significantie", value: "⚙", text: "Wanneer is een milieuaspect significant?" },
    {
      href: "/beheer/vestigingen-import",
      title: "Vestigingen importeren",
      value: "⇪",
      text: "Tabblad Vestigingen uit het register wet- en regelgeving.",
      show: canEdit,
    },
    {
      href: "/beheer/logboek",
      title: "Logboek",
      value: auditCount.toLocaleString("nl-NL"),
      text: "Audit trail: wie deed wat en wanneer.",
      show: can(user.role, "auditlog.view"),
    },
  ];

  return (
    <>
      <PageHeader title="Stamgegevens" description="Gegevens die in het hele systeem terugkomen. Klik op een onderdeel om te bekijken en te wijzigen." />
      <BeheerNav active="/beheer" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles
          .filter((t) => t.show !== false)
          .map((t) => (
            <Link key={t.href} href={t.href} className="card block no-underline hover:border-brand-red">
              <div className="flex items-baseline justify-between">
                <h2 className="text-neutral-900">{t.title}</h2>
                <span className="text-2xl font-semibold text-brand-red-dark tabular-nums">{t.value}</span>
              </div>
              <p className="mt-1 text-sm text-neutral-600">{t.text}</p>
              {t.warn && <p className="mt-1 text-xs font-medium text-amber-700">{t.warn}</p>}
            </Link>
          ))}
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
    </>
  );
}
