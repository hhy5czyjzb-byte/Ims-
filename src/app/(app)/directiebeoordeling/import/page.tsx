import { requirePagePermission } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ReviewImportForm } from "@/components/review/review-import-form";

export const metadata = { title: "PowerPoint-template inlezen" };

export default async function ReviewImportPage() {
  await requirePagePermission("review.edit");
  return (
    <>
      <PageHeader
        title="PowerPoint-template inlezen"
        description="Lees je managementreview (PowerPoint) in. Alle dia's komen in de app met dezelfde opbouw, foto's, kaarten, kengetallen, tabellen en grafieken; daarna bewerk je alles per dia en download je weer een PowerPoint in precies deze opmaak."
        breadcrumb={[{ href: "/directiebeoordeling", label: "Directiebeoordeling" }]}
        print={false}
      />
      <ReviewImportForm />
    </>
  );
}
