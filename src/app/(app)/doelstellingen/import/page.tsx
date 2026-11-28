import { requirePagePermission } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ImportWizard } from "@/components/import-wizard";
import { OBJECTIVE_IMPORT_FIELDS } from "@/lib/objectives";
import { importObjectives } from "../actions";

export const metadata = { title: "Doelstellingen importeren" };

export default async function ObjectiveImportPage() {
  await requirePagePermission("objectives.edit");
  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/doelstellingen", label: "Doelstellingen" }]}
        title="Importeren uit Excel"
        description="Lees een lijst met doelstellingen in (bijv. de KAM- of milieudoelstellingen uit de managementreview). De categorie wordt herkend uit de kolom Categorie of uit de tekst; een status (behaald, deels, niet behaald, …) wordt als beoordeling vastgelegd."
        print={false}
      />
      <ImportWizard
        fields={OBJECTIVE_IMPORT_FIELDS}
        importAction={importObjectives}
        registerHref="/doelstellingen?status=alle"
        matchHint="Herkend op het eigen nummer, anders op de omschrijving."
      />
    </>
  );
}
