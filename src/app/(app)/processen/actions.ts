"use server";

import { safeAction, UserError, type ActionResult } from "@/lib/action-result";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { RaciType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { optionalId, optionalText, parseForm, requiredText } from "@/lib/forms";

const processSchema = z.object({
  name: requiredText(200),
  code: optionalText,
  description: optionalText,
  purpose: optionalText,
  input: optionalText,
  output: optionalText,
  disciplineId: optionalId,
  ownerId: optionalId,
  sortOrder: z.coerce.number().int().default(0),
});

function revalidateProcess(id?: string) {
  revalidatePath("/processen");
  if (id) revalidatePath(`/processen/${id}`);
}

export async function createProcess(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("processes.edit");
    const data = parseForm(processSchema, formData);
    const process = await prisma.process.create({ data });
    await logAudit({ user, action: "CREATE", entityType: "Process", entityId: process.id, summary: `Proces "${process.name}" aangemaakt` });
    revalidateProcess();
    redirect(`/processen/${process.id}`);
  });
}

export async function updateProcess(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("processes.edit");
    const data = parseForm(processSchema, formData);
    await prisma.process.update({ where: { id }, data });
    await logAudit({ user, action: "UPDATE", entityType: "Process", entityId: id, summary: `Proces "${data.name}" gewijzigd`, details: { ...data } });
    revalidateProcess(id);
  });
}

export async function deleteProcess(id: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("processes.edit");
    const p = await prisma.process.delete({ where: { id } });
    await logAudit({ user, action: "DELETE", entityType: "Process", entityId: id, summary: `Proces "${p.name}" verwijderd` });
    revalidateProcess();
    redirect("/processen");
  });
}

const linksSchema = z.object({
  documentIds: z.array(z.string().min(1)).max(500),
  requirementIds: z.array(z.string().min(1)).max(2000),
});

export async function setProcessLinks(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("processes.edit");
    const { documentIds, requirementIds } = parseForm(linksSchema, formData, ["documentIds", "requirementIds"]);
    await prisma.process.update({
      where: { id },
      data: {
        documents: { set: documentIds.map((d) => ({ id: d })) },
        requirements: { set: requirementIds.map((r) => ({ id: r })) },
      },
    });
    await logAudit({ user, action: "UPDATE", entityType: "Process", entityId: id, summary: "Koppelingen gewijzigd", details: { documentIds, requirementIds } });
    revalidateProcess(id);
    revalidatePath("/normen", "layout");
  });
}

// ── Processtappen ─────────────────────────────────────────────

const stepSchema = z.object({ name: requiredText(200), description: optionalText });

export async function createStep(processId: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("processes.edit");
    const data = parseForm(stepSchema, formData);
    const last = await prisma.processStep.findFirst({ where: { processId }, orderBy: { sortOrder: "desc" } });
    const step = await prisma.processStep.create({ data: { ...data, processId, sortOrder: (last?.sortOrder ?? 0) + 10 } });
    await logAudit({ user, action: "CREATE", entityType: "ProcessStep", entityId: step.id, summary: `Stap "${step.name}" toegevoegd` });
    revalidateProcess(processId);
    redirect(`/processen/${processId}?stap=${step.id}`);
  });
}

export async function updateStep(processId: string, stepId: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("processes.edit");
    const data = parseForm(stepSchema, formData);
    await prisma.processStep.update({ where: { id: stepId, processId }, data });
    await logAudit({ user, action: "UPDATE", entityType: "ProcessStep", entityId: stepId, summary: `Stap "${data.name}" gewijzigd` });
    revalidateProcess(processId);
  });
}

export async function moveStep(processId: string, stepId: string, direction: "up" | "down"): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("processes.edit");
    const steps = await prisma.processStep.findMany({ where: { processId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    const idx = steps.findIndex((s) => s.id === stepId);
    const swap = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swap < 0 || swap >= steps.length) return;
    [steps[idx], steps[swap]] = [steps[swap], steps[idx]];
    // Hernummer alle stappen (10, 20, 30…) zodat de volgorde altijd eenduidig is.
    await prisma.$transaction(steps.map((s, i) => prisma.processStep.update({ where: { id: s.id }, data: { sortOrder: (i + 1) * 10 } })));
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "ProcessStep",
      entityId: stepId,
      summary: `Stap verplaatst (${direction === "up" ? "omhoog" : "omlaag"})`,
    });
    revalidateProcess(processId);
  });
}

export async function deleteStep(processId: string, stepId: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("processes.edit");
    const s = await prisma.processStep.delete({ where: { id: stepId, processId } });
    await logAudit({ user, action: "DELETE", entityType: "ProcessStep", entityId: stepId, summary: `Stap "${s.name}" verwijderd` });
    revalidateProcess(processId);
    redirect(`/processen/${processId}`);
  });
}

export async function setStepLinks(processId: string, stepId: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("processes.edit");
    const { documentIds, requirementIds } = parseForm(linksSchema, formData, ["documentIds", "requirementIds"]);
    await prisma.processStep.update({
      where: { id: stepId, processId },
      data: {
        documents: { set: documentIds.map((d) => ({ id: d })) },
        requirements: { set: requirementIds.map((r) => ({ id: r })) },
      },
    });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "ProcessStep",
      entityId: stepId,
      summary: "Koppelingen gewijzigd",
      details: { documentIds, requirementIds },
    });
    revalidateProcess(processId);
    revalidatePath("/normen", "layout");
  });
}

// ── RACI ──────────────────────────────────────────────────────

const raciSchema = z
  .object({
    type: z.enum(RaciType),
    assignee: requiredText(100), // "f:<functieId>" of "u:<userId>"
    note: optionalText,
  })
  .transform((v) => ({
    type: v.type,
    note: v.note,
    jobFunctionId: v.assignee.startsWith("f:") ? v.assignee.slice(2) : null,
    userId: v.assignee.startsWith("u:") ? v.assignee.slice(2) : null,
  }))
  .refine((v) => v.jobFunctionId || v.userId, { message: "Kies een functie of persoon" });

export async function addRaci(processId: string, stepId: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("processes.edit");
    const data = parseForm(raciSchema, formData);
    const step = await prisma.processStep.findFirst({ where: { id: stepId, processId }, include: { raci: true } });
    if (!step) throw new UserError("Processtap niet gevonden.");
    if (data.type === "A" && step.raci.some((r) => r.type === "A")) {
      throw new UserError("Er kan maar één Accountable (eindverantwoordelijke) per processtap zijn.");
    }
    if (step.raci.some((r) => r.type === data.type && r.jobFunctionId === data.jobFunctionId && r.userId === data.userId)) {
      throw new UserError("Deze toewijzing bestaat al.");
    }
    const raci = await prisma.raciAssignment.create({ data: { ...data, stepId } });
    await logAudit({
      user,
      action: "CREATE",
      entityType: "RaciAssignment",
      entityId: raci.id,
      summary: `RACI ${data.type} toegevoegd aan stap "${step.name}"`,
    });
    revalidateProcess(processId);
  });
}

export async function removeRaci(processId: string, raciId: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("processes.edit");
    const raci = await prisma.raciAssignment.findUnique({ where: { id: raciId }, include: { step: true } });
    if (!raci || raci.step.processId !== processId) throw new UserError("RACI-toewijzing niet gevonden.");
    await prisma.raciAssignment.delete({ where: { id: raciId } });
    await logAudit({
      user,
      action: "DELETE",
      entityType: "RaciAssignment",
      entityId: raciId,
      summary: `RACI ${raci.type} verwijderd van stap "${raci.step.name}"`,
    });
    revalidateProcess(processId);
  });
}
