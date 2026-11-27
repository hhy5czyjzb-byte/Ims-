"use server";

import { safeAction, UserError, type ActionResult } from "@/lib/action-result";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { localMode } from "@/lib/env";
import { createBackup } from "@/lib/backup";
import { optionalText, parseForm, requiredText } from "@/lib/forms";

type Kind = "location" | "discipline" | "jobFunction";

const schemas = {
  location: z.object({ name: requiredText(100), address: optionalText }),
  discipline: z.object({ name: requiredText(100) }),
  jobFunction: z.object({ name: requiredText(100), description: optionalText }),
};

const ENTITY: Record<Kind, string> = { location: "Location", discipline: "Discipline", jobFunction: "JobFunction" };

export async function createMasterData(kind: Kind, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("masterdata.edit");
    const data = parseForm(schemas[kind], formData);
    let id: string;
    try {
      if (kind === "location") id = (await prisma.location.create({ data: data as z.infer<typeof schemas.location> })).id;
      else if (kind === "discipline") id = (await prisma.discipline.create({ data: data as z.infer<typeof schemas.discipline> })).id;
      else id = (await prisma.jobFunction.create({ data: data as z.infer<typeof schemas.jobFunction> })).id;
    } catch {
      throw new UserError(`"${data.name}" bestaat al.`);
    }
    await logAudit({ user, action: "CREATE", entityType: ENTITY[kind], entityId: id, summary: `"${data.name}" toegevoegd` });
    revalidatePath("/beheer");
  });
}

export async function toggleActive(kind: "location" | "discipline", id: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("masterdata.edit");
    const row = kind === "location" ? await prisma.location.findUnique({ where: { id } }) : await prisma.discipline.findUnique({ where: { id } });
    if (!row) throw new UserError("Niet gevonden.");
    if (kind === "location") await prisma.location.update({ where: { id }, data: { active: !row.active } });
    else await prisma.discipline.update({ where: { id }, data: { active: !row.active } });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: ENTITY[kind],
      entityId: id,
      summary: `"${row.name}" ${row.active ? "gedeactiveerd" : "geactiveerd"}`,
    });
    revalidatePath("/beheer");
  });
}

export async function deleteJobFunction(id: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("masterdata.edit");
    const f = await prisma.jobFunction.delete({ where: { id } });
    await logAudit({ user, action: "DELETE", entityType: "JobFunction", entityId: id, summary: `Functie "${f.name}" verwijderd` });
    revalidatePath("/beheer");
  });
}

/** Back-up met hersteltest maken vanuit de app (alleen lokale modus; in fase 2 regelt Azure de back-ups). */
export async function createBackupNow(): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("backup.manage");
    if (!localMode) throw new UserError("Back-ups maken vanuit de app kan alleen in de lokale modus.");
    let info;
    try {
      info = await createBackup({ verify: true });
    } catch (err) {
      throw new UserError(`Back-up mislukt: ${(err as Error).message}`);
    }
    await logAudit({
      user,
      action: "CREATE",
      entityType: "Backup",
      entityId: info.name,
      summary: `Back-up ${info.name} gemaakt — ${info.verify?.ok ? "hersteltest geslaagd" : `hersteltest NIET geslaagd: ${info.verify?.message ?? "niet uitgevoerd"}`}`,
    });
    revalidatePath("/beheer");
    revalidatePath("/");
    if (!info.verify?.ok) throw new UserError(`Back-up gemaakt, maar de hersteltest is niet geslaagd: ${info.verify?.message}`);
  });
}
