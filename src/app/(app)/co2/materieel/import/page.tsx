import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { ImportWizard } from "@/components/import-wizard";
import { VEHICLE_IMPORT_FIELDS } from "@/lib/fleet";
import { importVehicles } from "../../wagenpark/actions";

export const metadata = { title: "Voertuigenlijst inlezen" };

export default async function VehicleImportPage() {
  const user = await requireUser();
  if (!can(user.role, "co2.manage")) {
    return (
      <div className="card max-w-xl">
        <h2>Geen toegang</h2>
        <p className="mt-2 text-sm text-neutral-600">Alleen QHSE kan voertuigen inlezen.</p>
      </div>
    );
  }
  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/co2", label: "CO2" },
          { href: "/co2/materieel", label: "Voertuigen en materieel" },
        ]}
        title="Voertuigenlijst inlezen uit Excel"
        description="Bijvoorbeeld een export uit het wagenparkbeheer of de leaselijst: per regel één voertuig met kenteken, soort, brandstof, Euroklasse, bouwjaar en de datum in/uit dienst. Brandstof en Euroklasse worden herkend uit tekst (bijv. 'Diesel', 'Euro VI', 'EURO 6d', 'BEV'); elektrische voertuigen krijgen automatisch milieuklasse 'Elektrisch'. Met de datums in/uit dienst rekent de wagenparkpagina elk jaar uit."
      />
      <ImportWizard
        fields={VEHICLE_IMPORT_FIELDS}
        importAction={importVehicles}
        registerHref="/co2/materieel"
        matchHint="Herkend op kenteken / machinenummer. Lege cellen wissen niets."
      />
    </>
  );
}
