"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ActionPriority, RiskCategory, RiskStatus, RiskType } from "@prisma/client";
import { safeAction, UserError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { requirePermission, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canEditRisk } from "@/lib/rbac";
import { riskCode } from "@/lib/risk";
import { optionalDate, optionalId, optionalText, parseForm, requiredText } from "@/lib/forms";

const score = z.coerce.number().int().min(1).max(5);
const optionalScore = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .pipe(z.number().int().min(1).max(5).nullable())
  .optional()
  .transform((v) => v ?? null);

const riskSchema = z
  .object({
    type: z.enum(RiskType),
    category: z.enum(RiskCategory),
    title: requiredText(300),
    description: optionalText,
    cause: optionalText,
    consequence: optionalText,
    measures: optionalText,
    likelihoodBefore: score,
    impactBefore: score,
    likelihoodAfter: optionalScore,
    impactAfter: optionalScore,
    ownerId: optionalId,
    disciplineId: optionalId,
    locationId: optionalId,
    reviewDate: optionalDate,
    processIds: z.array(z.string().min(1)).max(500),
    requirementIds: z.array(z.string().min(1)).max(2000),
  })
  .refine((v) => (v.likelihoodAfter == null) === (v.impactAfter == null), {
    message: "Vul bij 'na maatregelen' zowel kans als effect in, of laat beide leeg",
    path: ["likelihoodAfter"],
  });

const MULTI = ["processIds", "requirementIds"];

function revalidateRisks(id?: string) {
  revalidatePath("/risicos");
  if (id) revalidatePath(`/risicos/${id}`);
  revalidatePath("/");
  revalidatePath("/normen", "layout");
  revalidatePath("/processen", "layout");
}

export async function createRisk(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("risks.create");
    const { processIds, requirementIds, ...data } = parseForm(riskSchema, formData, MULTI);
    const risk = await prisma.risk.create({
      data: {
        ...data,
        createdById: user.id,
        processes: { connect: processIds.map((id) => ({ id })) },
        requirements: { connect: requirementIds.map((id) => ({ id })) },
      },
    });
    await logAudit({
      user,
      action: "CREATE",
      entityType: "Risk",
      entityId: risk.id,
      summary: `${riskCode(risk.number, risk.type)} "${risk.title}" aangemaakt`,
    });
    revalidateRisks();
    redirect(`/risicos/${risk.id}`);
  });
}

async function loadEditable(id: string) {
  const user = await requireUser();
  const risk = await prisma.risk.findUnique({ where: { id } });
  if (!risk) throw new UserError("Risico niet gevonden.");
  if (!canEditRisk(user, risk)) throw new UserError("Alleen de eigenaar, de aanmaker of KAM kan dit risico wijzigen.");
  return { user, risk };
}

export async function updateRisk(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const { user, risk } = await loadEditable(id);
    const parsed = parseForm(riskSchema, formData, MULTI);
    const status = z.enum(RiskStatus).parse(formData.get("status") ?? risk.status);
    const { processIds, requirementIds, ...data } = parsed;
    await prisma.risk.update({
      where: { id },
      data: {
        ...data,
        status,
        processes: { set: processIds.map((p) => ({ id: p })) },
        requirements: { set: requirementIds.map((r) => ({ id: r })) },
      },
    });
    const scoreChange =
      risk.likelihoodAfter !== data.likelihoodAfter ||
      risk.impactAfter !== data.impactAfter ||
      risk.likelihoodBefore !== data.likelihoodBefore ||
      risk.impactBefore !== data.impactBefore;
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "Risk",
      entityId: id,
      summary: `${riskCode(risk.number, data.type)} gewijzigd${scoreChange ? " (beoordeling aangepast)" : ""}${risk.status !== status ? ` (status ${risk.status} → ${status})` : ""}`,
      details: { ...data, status, reviewDate: data.reviewDate?.toISOString() ?? null, processIds, requirementIds },
    });
    revalidateRisks(id);
  });
}

export async function deleteRisk(id: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("risks.editAny");
    const risk = await prisma.risk.delete({ where: { id } });
    await logAudit({ user, action: "DELETE", entityType: "Risk", entityId: id, summary: `${riskCode(risk.number, risk.type)} "${risk.title}" verwijderd` });
    revalidateRisks();
    redirect("/risicos");
  });
}

const riskActionSchema = z.object({
  title: requiredText(300),
  ownerId: optionalId,
  deadline: optionalDate,
  priority: z.enum(ActionPriority).default("MEDIUM"),
});

/** Maatregel als actie vastleggen, gekoppeld aan het risico (bron: Risico / kans). */
export async function createRiskAction(riskId: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("actions.create");
    const risk = await prisma.risk.findUnique({ where: { id: riskId }, include: { requirements: { select: { id: true } } } });
    if (!risk) throw new UserError("Risico niet gevonden.");
    const data = parseForm(riskActionSchema, formData);
    const action = await prisma.action.create({
      data: {
        ...data,
        source: "RISK",
        riskId,
        createdById: user.id,
        disciplineId: risk.disciplineId,
        locationId: risk.locationId,
        requirements: { connect: risk.requirements },
      },
    });
    await logAudit({
      user,
      action: "CREATE",
      entityType: "Action",
      entityId: action.id,
      summary: `Actie #${action.number} aangemaakt vanuit ${riskCode(risk.number, risk.type)}`,
    });
    revalidateRisks(riskId);
    revalidatePath("/acties");
  });
}
