"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { safeAction, type ActionResult } from "@/lib/action-result";
import { CO2_REPORT_KEY, getReportTexts, reportTextSchema, textsFromFile } from "@/lib/co2-report";
import { UserError } from "@/lib/action-result";

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

/** Teksten inlezen uit een eerder gedownload tekstenbestand: gevulde velden uit het bestand vervangen de huidige. */
export async function importReportTexts(json: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("co2.manage");
    if (json.length > 2_000_000) throw new UserError("Het bestand is te groot.");
    let incoming;
    try {
      incoming = textsFromFile(json);
    } catch (e) {
      throw new UserError(e instanceof Error ? e.message : "Het bestand kon niet worden gelezen.");
    }
    const data = reportTextSchema.parse({ ...(await getReportTexts()), ...incoming });
    const value = JSON.stringify(data);
    await prisma.appSetting.upsert({
      where: { key: CO2_REPORT_KEY },
      create: { key: CO2_REPORT_KEY, value, updatedById: user.id },
      update: { value, updatedById: user.id },
    });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "AppSetting",
      entityId: CO2_REPORT_KEY,
      summary: `Teksten van het CO2-jaarverslag ingelezen uit bestand (${Object.keys(incoming).length} onderdelen)`,
    });
    revalidatePath("/co2/rapportage", "layout");
  });
}
