import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { ImportWizard } from "@/components/import-wizard";
import { LOCATION_IMPORT_FIELDS } from "@/lib/location-import";
import { importLocations } from "../actions";

export const metadata = { title: "Vestigingen importeren" };

export default async function LocationImportPage() {
  const user = await requireUser();
  if (!can(user.role, "masterdata.edit")) {
    return (
      <div className="card max-w-xl">
        <h2>Geen toegang</h2>
        <p className="mt-2 text-sm text-neutral-600">Alleen QHSE kan vestigingen importeren.</p>
      </div>
    );
  }
  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/beheer", label: "Stamgegevens" }]}
        title="Vestigingen importeren"
        description="Bijvoorbeeld het tabblad Vestigingen uit het register wet- en regelgeving. Bestaande vestigingen worden op naam herkend en bijgewerkt."
      />
      <ImportWizard
        fields={LOCATION_IMPORT_FIELDS}
        importAction={importLocations}
        registerHref="/beheer/vestigingen"
        matchHint="Herkend op de naam van de vestiging."
      />
    </>
  );
}
