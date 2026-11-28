import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { ImportWizard } from "@/components/import-wizard";
import { ACTION_IMPORT_FIELDS } from "@/lib/action-import";
import { importActions } from "../actions";

export const metadata = { title: "Acties importeren" };

export default async function ActionImportPage() {
  const user = await requireUser();
  if (!can(user.role, "actions.editAny")) {
    return (
      <div className="card max-w-xl">
        <h2>Geen toegang</h2>
        <p className="mt-2 text-sm text-neutral-600">Alleen QHSE kan acties importeren.</p>
      </div>
    );
  }
  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/acties", label: "Acties" }]}
        title="Importeren uit Excel"
        description="Lees een bestaande actielijst in. De bron (audit, ongeval, klacht, directiebeoordeling, …), soort, status en prioriteit worden herkend uit de tekst. Een eigenaar die geen gebruiker van de app is, wordt als naam opgeslagen."
      />
      <ImportWizard
        fields={ACTION_IMPORT_FIELDS}
        importAction={importActions}
        registerHref="/acties?status=alle"
        matchHint="Herkend op het eigen actienummer."
      />
    </>
  );
}
