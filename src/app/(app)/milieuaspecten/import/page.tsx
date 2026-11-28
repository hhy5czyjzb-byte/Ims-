import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { ImportWizard } from "@/components/import-wizard";
import { ASPECT_IMPORT_FIELDS } from "@/lib/aspect-import";
import { importAspects } from "../actions";

export const metadata = { title: "Importeren milieuaspecten" };

export default async function AspectImportPage() {
  const user = await requireUser();
  if (!can(user.role, "aspects.edit")) {
    return (
      <div className="card max-w-xl">
        <h2>Geen toegang</h2>
        <p className="mt-2 text-sm text-neutral-600">Alleen QHSE kan het milieuaspectenregister importeren.</p>
      </div>
    );
  }
  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/milieuaspecten", label: "Milieuaspecten" }]}
        title="Importeren uit Excel"
        description={
          <>
            Lees het milieuaspectenregister (MAR) in, tabblad <strong>MAR</strong>. De kolommen worden herkend; risico, risiconiveau en signaal rekent de app
            zelf uit. Register nr. (W-nummers) en Risico- en kansenregister (R/K-nummers) worden gekoppeld: importeer daarom eerst het register wet- en
            regelgeving en het risico- en kansenregister.
          </>
        }
      />
      <ImportWizard
        fields={ASPECT_IMPORT_FIELDS}
        importAction={importAspects}
        registerHref="/milieuaspecten"
        matchHint="Herkend op nummer (A001), of anders op bedrijfsonderdeel + locatie + activiteit + aspect."
      />
    </>
  );
}
