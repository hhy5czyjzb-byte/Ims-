"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { safeAction, UserError, type ActionResult } from "@/lib/action-result";
import { diffFields } from "@/lib/audit-diff";
import { optionalDate, optionalId, optionalText, parseForm, requiredText } from "@/lib/forms";

const schema = z.object({
  section: requiredText(200),
  stream: requiredText(300),
  carrierId: optionalId,
  unit: optionalText,
  source: optionalText,
  dataOwner: optionalText,
  executor: optionalText,
  requestPeriod: optionalText,
  analysisPeriod: optionalText,
  deviation: optionalText,
  uncertainty: optionalText,
  improvement: optionalText,
  qualityScore: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Math.max(1, Math.min(5, Math.round(Number(v) || 0))) || null : null)),
  lastCheckedAt: optionalDate,
});

function revalidate() {
  revalidatePath("/co2/dkmp", "layout");
}

export async function createDkmpItem(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("co2.manage");
    const data = parseForm(schema, formData);
    const item = await prisma.dataQualityItem.create({ data });
    await logAudit({ user, action: "CREATE", entityType: "DataQualityItem", entityId: item.id, summary: `DKMP: ${data.section} – ${data.stream} toegevoegd` });
    revalidate();
  });
}

export async function updateDkmpItem(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("co2.manage");
    const data = parseForm(schema, formData);
    const old = await prisma.dataQualityItem.findUnique({ where: { id } });
    await prisma.dataQualityItem.update({ where: { id }, data });
    const changes = diffFields(old ?? {}, data, {
      section: "Groep",
      stream: "Emissiestroom",
      unit: "Eenheid",
      source: "Bron",
      dataOwner: "Brondata van",
      executor: "Uitvoerder",
      requestPeriod: "Uitvraag",
      analysisPeriod: "Analyse",
      deviation: "Afwijking",
      uncertainty: "Onzekerheden",
      improvement: "Verbeterplan",
      qualityScore: "Kwaliteit",
      lastCheckedAt: "Gecontroleerd",
    });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "DataQualityItem",
      entityId: id,
      summary: `DKMP: ${data.section} – ${data.stream} gewijzigd`,
      details: { changes },
    });
    revalidate();
    redirect("/co2/dkmp");
  });
}

export async function deleteDkmpItem(id: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("co2.manage");
    const item = await prisma.dataQualityItem.findUnique({ where: { id } });
    if (!item) throw new UserError("Regel niet gevonden.");
    await prisma.dataQualityItem.delete({ where: { id } });
    await logAudit({ user, action: "DELETE", entityType: "DataQualityItem", entityId: id, summary: `DKMP: ${item.section} – ${item.stream} verwijderd` });
    revalidate();
    redirect("/co2/dkmp");
  });
}
