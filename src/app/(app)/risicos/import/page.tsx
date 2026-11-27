import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { ImportWizard } from "@/components/import-wizard";
import { RISK_IMPORT_FIELDS } from "@/lib/risk-import";
import { importRisks } from "../actions";

export const metadata = { title: "Risico's en kansen importeren" };

export default async function RiskImportPage() {
  const user = await requireUser();
  if (!can(user.role, "risks.editAny")) {
    return (
      <div className="card max-w-xl">
        <h2>Geen toegang</h2>
        <p className="mt-2 text-sm text-neutral-600">Alleen QHSE kan het risico- en kansenregister importeren.</p>
      </div>
    );
  }
  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/risicos", label: "Risico's en kansen" }]}
        title="Importeren uit Excel"
        description={
          <>
            Lees het risico- en kansenregister in. Importeer de tabbladen <strong>Risico&apos;s</strong> en <strong>Kansen</strong> één voor één (kies het
            tabblad in stap 2). Of een regel een risico of een kans is, volgt uit het nummer (R… of K…). Score, niveau en prioriteit rekent de app zelf;
            BU&apos;s worden op naam herkend (meerdere met een komma, &quot;Groep&quot; = bedrijfsbreed).
          </>
        }
      />
      <ImportWizard
        fields={RISK_IMPORT_FIELDS}
        importAction={importRisks}
        registerHref="/risicos"
        matchHint="Herkend op het eigen nummer (R01, K12), of anders op omschrijving."
      />
    </>
  );
}
