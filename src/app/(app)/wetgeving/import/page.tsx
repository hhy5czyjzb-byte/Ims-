import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { LegalImport } from "./legal-import";

export const metadata = { title: "Importeren wet- en regelgeving" };

export default async function LegalImportPage() {
  const user = await requireUser();
  if (!can(user.role, "legal.edit")) {
    return (
      <div className="card max-w-xl">
        <h2>Geen toegang</h2>
        <p className="mt-2 text-sm text-neutral-600">Alleen KAM kan het register importeren.</p>
      </div>
    );
  }
  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/wetgeving", label: "Wet- en regelgeving" }]}
        title="Importeren uit Excel"
        description="Lees het bestaande register in. Je koppelt zelf welke kolom bij welk veld hoort; disciplines, locaties en eigenaren worden op naam herkend. Een herimport werkt bestaande eisen bij."
      />
      <LegalImport />
    </>
  );
}
