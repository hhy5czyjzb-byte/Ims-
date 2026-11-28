"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { safeAction, type ActionResult } from "@/lib/action-result";
import { CO2_REPORT_KEY, reportTextSchema } from "@/lib/co2-report";

/** Vaste teksten van het CO2-jaarverslag opslaan. */
export async function saveReportTexts(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("co2.manage");
    const raw = Object.fromEntries(Object.keys(reportTextSchema.shape).map((k) => [k, String(formData.get(k) ?? "").trim()]));
    const data = reportTextSchema.parse(raw);
    const value = JSON.stringify(data);
    await prisma.appSetting.upsert({
      where: { key: CO2_REPORT_KEY },
      create: { key: CO2_REPORT_KEY, value, updatedById: user.id },
      update: { value, updatedById: user.id },
    });
    await logAudit({ user, action: "UPDATE", entityType: "AppSetting", entityId: CO2_REPORT_KEY, summary: "Teksten van het CO2-jaarverslag gewijzigd" });
    revalidatePath("/co2/rapportage", "layout");
  });
}
