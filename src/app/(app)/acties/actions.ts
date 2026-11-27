"use server";

import { safeAction, UserError, type ActionResult } from "@/lib/action-result";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ActionPriority, ActionSource, ActionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canEditAction } from "@/lib/rbac";
import { optionalDate, optionalId, optionalText, parseForm, requiredText } from "@/lib/forms";
import { ACTION_STATUS_LABEL } from "@/lib/labels";

const actionSchema = z.object({
  title: requiredText(300),
  description: optionalText,
  source: z.enum(ActionSource).default("MANUAL"),
  priority: z.enum(ActionPriority).default("MEDIUM"),
  ownerId: optionalId,
  deadline: optionalDate,
  disciplineId: optionalId,
  locationId: optionalId,
  requirementIds: z.array(z.string().min(1)).max(500),
});

export async function createAction(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("actions.create");
    const { requirementIds, ...data } = parseForm(actionSchema, formData, ["requirementIds"]);
    const action = await prisma.action.create({
      data: { ...data, createdById: user.id, requirements: { connect: requirementIds.map((id) => ({ id })) } },
    });
    await logAudit({ user, action: "CREATE", entityType: "Action", entityId: action.id, summary: `Actie #${action.number} "${action.title}" aangemaakt` });
    revalidatePath("/acties");
    revalidatePath("/");
    redirect(`/acties/${action.id}`);
  });
}

async function loadEditable(id: string) {
  const user = await requireUser();
  const action = await prisma.action.findUnique({ where: { id } });
  if (!action) throw new UserError("Actie niet gevonden.");
  if (!canEditAction(user, action)) throw new UserError("Alleen de eigenaar, de aanmaker of QHSE kan deze actie wijzigen.");
  return { user, action };
}

const updateSchema = actionSchema.extend({
  status: z.enum(ActionStatus),
  result: optionalText,
});

export async function updateAction(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const { user, action } = await loadEditable(id);
    const { requirementIds, ...data } = parseForm(updateSchema, formData, ["requirementIds"]);
    const completedAt = data.status === "DONE" ? (action.completedAt ?? new Date()) : null;
    await prisma.action.update({
      where: { id },
      data: { ...data, completedAt, requirements: { set: requirementIds.map((r) => ({ id: r })) } },
    });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "Action",
      entityId: id,
      summary: `Actie #${action.number} gewijzigd${action.status !== data.status ? ` (status ${ACTION_STATUS_LABEL[action.status]} → ${ACTION_STATUS_LABEL[data.status]})` : ""}`,
      details: { ...data, deadline: data.deadline?.toISOString() ?? null, requirementIds },
    });
    revalidatePath("/acties");
    revalidatePath(`/acties/${id}`);
    revalidatePath("/");
  });
}

export async function setActionStatus(id: string, status: ActionStatus): Promise<ActionResult> {
  return safeAction(async () => {
    const { user, action } = await loadEditable(id);
    const parsed = z.enum(ActionStatus).parse(status);
    await prisma.action.update({
      where: { id },
      data: { status: parsed, completedAt: parsed === "DONE" ? (action.completedAt ?? new Date()) : null },
    });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "Action",
      entityId: id,
      summary: `Actie #${action.number}: status ${ACTION_STATUS_LABEL[action.status]} → ${ACTION_STATUS_LABEL[parsed]}`,
    });
    revalidatePath("/acties");
    revalidatePath(`/acties/${id}`);
    revalidatePath("/");
  });
}

export async function deleteAction(id: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("actions.editAny");
    const action = await prisma.action.delete({ where: { id } });
    await logAudit({ user, action: "DELETE", entityType: "Action", entityId: id, summary: `Actie #${action.number} "${action.title}" verwijderd` });
    revalidatePath("/acties");
    revalidatePath("/");
    redirect("/acties");
  });
}
