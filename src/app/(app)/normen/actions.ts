"use server";

import { safeAction, UserError, type ActionResult } from "@/lib/action-result";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { NormCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { optionalId, optionalText, parseForm, requiredText } from "@/lib/forms";

const normSchema = z.object({
  code: requiredText(50),
  name: requiredText(200),
  version: optionalText,
  category: z.enum(NormCategory),
  description: optionalText,
  sortOrder: z.coerce.number().int().default(0),
  active: z
    .string()
    .optional()
    .transform((v) => v === "on"),
});

export async function createNorm(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("norms.edit");
    const data = parseForm(normSchema, formData);
    const exists = await prisma.norm.findUnique({ where: { code: data.code } });
    if (exists) throw new UserError(`Norm met code "${data.code}" bestaat al.`);
    const norm = await prisma.norm.create({ data: { ...data, active: true } });
    await logAudit({ user, action: "CREATE", entityType: "Norm", entityId: norm.id, summary: `Norm ${norm.code} aangemaakt` });
    revalidatePath("/normen");
    redirect(`/normen/${norm.id}`);
  });
}

export async function updateNorm(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("norms.edit");
    const data = parseForm(normSchema, formData);
    await prisma.norm.update({ where: { id }, data });
    await logAudit({ user, action: "UPDATE", entityType: "Norm", entityId: id, summary: `Norm ${data.code} gewijzigd`, details: { ...data } });
    revalidatePath("/normen");
    revalidatePath(`/normen/${id}`);
  });
}

export async function deleteNorm(id: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("norms.edit");
    const norm = await prisma.norm.delete({ where: { id } });
    await logAudit({ user, action: "DELETE", entityType: "Norm", entityId: id, summary: `Norm ${norm.code} verwijderd` });
    revalidatePath("/normen");
    redirect("/normen");
  });
}

const requirementSchema = z.object({
  clause: requiredText(30),
  title: requiredText(300),
  description: optionalText,
  parentId: optionalId,
  sortOrder: z.coerce.number().int().default(0),
});

async function assertValidParent(normId: string, parentId: string | null | undefined, selfId?: string) {
  if (!parentId) return;
  if (parentId === selfId) throw new UserError("Een eis kan niet zijn eigen bovenliggende eis zijn.");
  const parent = await prisma.normRequirement.findUnique({ where: { id: parentId } });
  if (!parent || parent.normId !== normId) throw new UserError("Bovenliggende eis hoort niet bij deze norm.");
  // Voorkom kringen
  let cursor = parent;
  for (let i = 0; i < 20 && cursor.parentId; i++) {
    if (cursor.parentId === selfId) throw new UserError("Deze indeling zou een kring veroorzaken.");
    const next = await prisma.normRequirement.findUnique({ where: { id: cursor.parentId } });
    if (!next) break;
    cursor = next;
  }
}

export async function createRequirement(normId: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("norms.edit");
    const data = parseForm(requirementSchema, formData);
    await assertValidParent(normId, data.parentId);
    const dup = await prisma.normRequirement.findUnique({ where: { normId_clause: { normId, clause: data.clause } } });
    if (dup) throw new UserError(`Paragraaf ${data.clause} bestaat al bij deze norm.`);
    const req = await prisma.normRequirement.create({ data: { ...data, normId } });
    await logAudit({ user, action: "CREATE", entityType: "NormRequirement", entityId: req.id, summary: `Eis ${req.clause} aangemaakt` });
    revalidatePath(`/normen/${normId}`);
  });
}

export async function updateRequirement(normId: string, reqId: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("norms.edit");
    const data = parseForm(requirementSchema, formData);
    await assertValidParent(normId, data.parentId, reqId);
    await prisma.normRequirement.update({ where: { id: reqId, normId }, data });
    await logAudit({ user, action: "UPDATE", entityType: "NormRequirement", entityId: reqId, summary: `Eis ${data.clause} gewijzigd`, details: { ...data } });
    revalidatePath(`/normen/${normId}`);
    revalidatePath(`/normen/${normId}/eisen/${reqId}`);
  });
}

export async function deleteRequirement(normId: string, reqId: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("norms.edit");
    const req = await prisma.normRequirement.delete({ where: { id: reqId, normId } });
    await logAudit({ user, action: "DELETE", entityType: "NormRequirement", entityId: reqId, summary: `Eis ${req.clause} verwijderd` });
    revalidatePath(`/normen/${normId}`);
    redirect(`/normen/${normId}`);
  });
}
