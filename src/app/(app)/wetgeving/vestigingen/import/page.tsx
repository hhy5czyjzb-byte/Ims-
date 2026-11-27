import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { ImportWizard } from "@/components/import-wizard";
import { LOCATION_AUDIT_IMPORT_FIELDS } from "@/lib/location-audit";
import { importLocationAudit } from "../actions";

export const metadata = { title: "Importeren compliance-audit" };

export default async function LocationAuditImportPage() {
  const user = await requireUser();
  if (!can(user.role, "legal.edit")) {
    return (
      <div className="card max-w-xl">
        <h2>Geen toegang</h2>
        <p className="mt-2 text-sm text-neutral-600">Alleen QHSE kan importeren.</p>
      </div>
    );
  }
  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/wetgeving", label: "Wet- en regelgeving" },
          { href: "/wetgeving/vestigingen", label: "Compliance-audit per vestiging" },
        ]}
        title="Importeren uit Excel"
        description="Lees het tabblad Compliance-audit in. De vragen komen in de vragenbank (elke vraag één keer, ook al staat hij per vestiging herhaald). Waar Oordeel, Bevinding of Actie is ingevuld, wordt dat vastgelegd als audit van die vestiging op de datum audit. Importeer eerst de vestigingen en het register."
      />
      <ImportWizard
        fields={LOCATION_AUDIT_IMPORT_FIELDS}
        importAction={importLocationAudit}
        registerHref="/wetgeving/vestigingen/vragen"
        matchHint="Vragen herkend op nr. wettelijke eis + vraagtekst."
      />
    </>
  );
}
