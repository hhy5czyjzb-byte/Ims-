import { requirePagePermission } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { Co2Nav } from "@/components/co2-nav";
import { Co2WorkbookImport } from "@/components/co2-workbook-import";

export const metadata = { title: "CO2-dashboard inlezen" };

export default async function Co2DashboardImportPage() {
  await requirePagePermission("co2.manage");
  return (
    <>
      <PageHeader
        title="CO2-prestatieladder"
        description="Lees je CO2-dashboard (handboek 4.0) in: emissiefactoren per jaar (WTT/TTW/WTW), GJ-conversie, organisaties, verbruik per jaar, kengetallen, DKMP en het plan van aanpak. Daarna rekent de app alles zelf uit; factoren en conversies blijven aanpasbaar."
        print={false}
      />
      <Co2Nav />
      <Co2WorkbookImport />
    </>
  );
}
