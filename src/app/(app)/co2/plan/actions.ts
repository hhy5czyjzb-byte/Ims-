"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ActionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { safeAction, UserError, type ActionResult } from "@/lib/action-result";
import { optionalDate, optionalId, optionalText, parseForm, requiredText } from "@/lib/forms";
import { parseDecimal } from "@/lib/co2";
import { diffFields } from "@/lib/audit-diff";

const pctField = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const p = parseDecimal(v.replace("%", ""));
    if (p.invalid || p.value === null) {
      ctx.addIssue({ code: "custom", message: "Vul een percentage in" });
      return z.NEVER;
    }
    return p.value;
  });

const schema = z.object({
  title: requiredText(300),
  description: optionalText,
  ownerId: optionalId,
  ownerText: optionalText,
  deadline: optionalDate,
  reductionTargetId: optionalId,
  streamGroup: optionalText,
  carrierId: optionalId,
  reductionPct: pctField,
  energyReductionPct: pctField,
  measureType: optionalText,
  skao: optionalText,
  skaoCategory: optionalText,
  term: optionalText,
  planning: optionalText,
  knowledgeNeed: optionalText,
  progressNote: optionalText,
  trl: optionalText,
  flexibilityImpact: optionalText,
  investment: optionalText,
  legislation: optionalText,
  resources: optionalText,
  valueChain: optionalText,
  currentYearActions: optionalText,
  tenderAdvantage: optionalText,
  notApplicableReason: optionalText,
});

function split(data: z.infer<typeof schema>) {
  const { title, description, ownerId, ownerText, deadline, reductionTargetId, ...co2 } = data;
  return { action: { title, description, ownerId, ownerText, deadline, reductionTargetId }, co2 };
}

function revalidate(id?: string) {
  revalidatePath("/co2", "layout");
  revalidatePath("/acties", "layout");
  if (id) revalidatePath(`/acties/${id}`);
}

/** Maatregel in het plan van aanpak = actie (bron CO2-reductie) met CO2-gegevens. */
export async function createCo2Measure(formData: FormData): Promise<ActionResult> {
  let id = "";
  const r = await safeAction(async () => {
    const user = await requirePermission("co2.manage");
    const { action, co2 } = split(parseForm(schema, formData));
    const a = await prisma.action.create({
      data: { ...action, source: "CO2_REDUCTION", kind: "IMPROVEMENT", createdById: user.id, co2Measure: { create: co2 } },
    });
    await logAudit({
      user,
      action: "CREATE",
      entityType: "Action",
      entityId: a.id,
      summary: `Maatregel #${a.number} "${a.title}" toegevoegd aan het plan van aanpak`,
    });
    id = a.id;
    revalidate();
  });
  if (r?.error) return r;
  redirect(`/co2/plan/${id}`);
}

export async function updateCo2Measure(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("co2.manage");
    const existing = await prisma.action.findUnique({ where: { id }, include: { co2Measure: true } });
    if (!existing) throw new UserError("Maatregel niet gevonden.");
    const parsed = parseForm(schema.extend({ status: z.enum(ActionStatus) }), formData);
    const { status, ...rest } = parsed;
    const { action, co2 } = split(rest);
    await prisma.action.update({
      where: { id },
      data: {
        ...action,
        status,
        completedAt: status === "DONE" ? (existing.completedAt ?? new Date()) : null,
        co2Measure: { upsert: { create: co2, update: co2 } },
      },
    });
    const changes = diffFields(
      { ...existing, ...(existing.co2Measure ?? {}) },
      { ...action, status, ...co2 },
      {
        title: "Maatregel",
        status: "Status",
        deadline: "Deadline",
        ownerText: "Verantwoordelijke",
        streamGroup: "Emissiestroom",
        reductionPct: "Reductie op stroom (%)",
        energyReductionPct: "Reductie op energie (%)",
        skao: "SKAO/eigen",
        skaoCategory: "SKAO-categorie",
        term: "Termijn",
        progressNote: "Voortgang",
        investment: "Investering",
      },
    );
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "Action",
      entityId: id,
      summary: `Maatregel #${existing.number} in het plan van aanpak gewijzigd`,
      details: { changes, co2: true },
    });
    revalidate(id);
  });
}
