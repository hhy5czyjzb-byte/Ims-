import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { ImportWizard } from "@/components/import-wizard";
import { REPORT_IMPORT_FIELDS } from "@/lib/reports";
import { importReports } from "../actions";

export const metadata = { title: "Meldingen importeren" };

export default async function ReportImportPage() {
  const user = await requireUser();
  if (!can(user.role, "reports.manage")) {
    return (
      <div className="card max-w-xl">
        <h2>Geen toegang</h2>
        <p className="mt-2 text-sm text-neutral-600">Alleen QHSE kan meldingen importeren.</p>
      </div>
    );
  }
  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/meldingen", label: "Meldingen" }]}
        title="Importeren uit Excel"
        description="Lees een bestaand afwijkingen-, klachten- of ongevallenregister in. De soort wordt herkend uit de kolom Soort (of uit de omschrijving), net als ernst, letsel en status. Vestigingen, bedrijfsonderdelen en behandelaars worden op naam gekoppeld."
      />
      <ImportWizard fields={REPORT_IMPORT_FIELDS} importAction={importReports} registerHref="/meldingen?status=alle" matchHint="Herkend op het eigen nummer." />
    </>
  );
}
