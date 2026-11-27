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
            Lees het bestaande milieuaspectenregister in. Koppel F, E en O (1–5) om de score te laten berekenen, of koppel de score uit het eigen register.{" "}
            <strong>Koppel je een kolom &quot;significant&quot;, dan wordt die beoordeling overgenomen</strong> (als handmatige bepaling), zodat jullie
            bestaande methode leidend blijft.
          </>
        }
      />
      <ImportWizard
        fields={ASPECT_IMPORT_FIELDS}
        importAction={importAspects}
        registerHref="/milieuaspecten"
        matchHint="Herkend op kenmerk, of anders op activiteit + aspect + situatie."
      />
    </>
  );
}
