"use server";

import { safeAction, UserError, type ActionResult } from "@/lib/action-result";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import type { ImportResult, ImportRow } from "@/lib/spreadsheet-import";
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

/** Vestigingen importeren of bijwerken (op naam). Lege cellen wissen niets. */
export async function importLocations(rowsInput: ImportRow[], options: { updateExisting: boolean }): Promise<ImportResult> {
  try {
    const user = await requirePermission("masterdata.edit");
    if (!Array.isArray(rowsInput) || rowsInput.length === 0) return { error: "Geen regels om te importeren." };
    const schema = z.object({
      rowNumber: z.number().int(),
      name: z.string().trim().min(1),
      address: z.string().trim().max(300).optional(),
      city: z.string().trim().max(200).optional(),
      activities: z.string().trim().max(2000).optional(),
      energySavingObligation: z.string().trim().max(50).optional(),
    });
    const warnings: string[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const input of rowsInput.slice(0, 500)) {
      const p = schema.safeParse(input);
      if (!p.success) {
        skipped++;
        continue;
      }
      const r = p.data;
      // Toelichtingsregels onder een tabel (lange zinnen) zijn geen vestiging.
      if (r.name.length > 80) {
        skipped++;
        warnings.push(`Rij ${r.rowNumber}: "${r.name.slice(0, 40)}…" lijkt geen vestigingsnaam — overgeslagen`);
        continue;
      }
      const data = Object.fromEntries(
        Object.entries({ address: r.address, city: r.city, activities: r.activities, energySavingObligation: r.energySavingObligation }).filter(
          ([, v]) => v !== undefined,
        ),
      );
      const existing = await prisma.location.findUnique({ where: { name: r.name } });
      if (existing) {
        if (options.updateExisting) {
          await prisma.location.update({ where: { id: existing.id }, data });
          updated++;
        } else skipped++;
      } else {
        await prisma.location.create({ data: { name: r.name, ...data } });
        created++;
      }
    }
    await logAudit({
      user,
      action: "CREATE",
      entityType: "Location",
      summary: `Import vestigingen: ${created} nieuw, ${updated} bijgewerkt, ${skipped} overgeslagen`,
    });
    revalidatePath("/beheer");
    return { created, updated, skipped, warnings };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof UserError) return { error: err.message };
    console.error("[import] vestigingen mislukt", err);
    return { error: "Import mislukt. Probeer het opnieuw." };
  }
}
