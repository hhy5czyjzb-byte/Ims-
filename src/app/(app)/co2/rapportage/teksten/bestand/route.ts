import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { getReportTexts, REPORT_FILE_TYPE } from "@/lib/co2-report";

/** Teksten van het CO2-jaarverslag als bestand (om over te zetten naar een andere omgeving, of als kopie). */
export async function GET() {
  const user = await requireUser();
  if (!can(user.role, "co2.manage")) return new Response("Geen toegang", { status: 403 });
  const texts = await getReportTexts();
  await logAudit({ user, action: "VIEW", entityType: "AppSetting", entityId: "co2.report", summary: "Teksten CO2-jaarverslag gedownload" });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify({ type: REPORT_FILE_TYPE, version: 1, texts }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="teksten-co2-jaarverslag-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
