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
import { optionalId, optionalText, parseForm, requiredText } from "@/lib/forms";
import { redirect } from "next/navigation";
import { splitList } from "@/lib/masterdata";

type Kind = "location" | "discipline" | "jobFunction";

const locationSchema = z.object({
  name: requiredText(100),
  kind: optionalText,
  address: optionalText,
  postalCode: optionalText,
  city: optionalText,
  managerText: optionalText,
  activities: optionalText,
  permitInfo: optionalText,
  energySavingObligation: optionalText,
  notes: optionalText,
  sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
});
const disciplineSchema = z.object({
  name: requiredText(100),
  description: optionalText,
  managerText: optionalText,
  aliases: optionalText,
  sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
});
const schemas = {
  location: locationSchema,
  discipline: disciplineSchema,
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
      else if (kind === "discipline") {
        const d = data as z.infer<typeof schemas.discipline>;
        id = (await prisma.discipline.create({ data: { ...d, aliases: splitList(d.aliases) } })).id;
      } else id = (await prisma.jobFunction.create({ data: data as z.infer<typeof schemas.jobFunction> })).id;
    } catch {
      throw new UserError(`"${data.name}" bestaat al.`);
    }
    await logAudit({ user, action: "CREATE", entityType: ENTITY[kind], entityId: id, summary: `"${data.name}" toegevoegd` });
    revalidatePath("/beheer", "layout");
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
    revalidatePath("/beheer", "layout");
    redirect("/beheer/functies");
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
      postalCode: z.string().trim().max(20).optional(),
      kind: z.string().trim().max(100).optional(),
      managerText: z.string().trim().max(200).optional(),
      permitInfo: z.string().trim().max(2000).optional(),
      notes: z.string().trim().max(2000).optional(),
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
        Object.entries({
          address: r.address,
          city: r.city,
          activities: r.activities,
          energySavingObligation: r.energySavingObligation,
          postalCode: r.postalCode,
          kind: r.kind,
          managerText: r.managerText,
          permitInfo: r.permitInfo,
          notes: r.notes,
        }).filter(([, v]) => v !== undefined && v !== ""),
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

// ── Wijzigen en verwijderen ───────────────────────────────────

function revalidateMasterData() {
  revalidatePath("/beheer", "layout");
  revalidatePath("/", "layout");
}

export async function updateLocation(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("masterdata.edit");
    const { active, ...data } = parseForm(locationSchema.extend({ active: z.literal("on").optional() }), formData);
    const old = await prisma.location.findUnique({ where: { id } });
    if (!old) throw new UserError("Vestiging niet gevonden.");
    if (data.name !== old.name && (await prisma.location.findUnique({ where: { name: data.name } })))
      throw new UserError(`Er is al een vestiging "${data.name}".`);
    await prisma.location.update({ where: { id }, data: { ...data, active: active === "on" } });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "Location",
      entityId: id,
      summary: old.name !== data.name ? `Vestiging "${old.name}" hernoemd naar "${data.name}"` : `Vestiging "${data.name}" gewijzigd`,
    });
    revalidateMasterData();
    redirect("/beheer/vestigingen");
  });
}

export async function deleteLocation(id: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("masterdata.edit");
    const l = await prisma.location.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            actions: true,
            risks: true,
            legalRequirements: true,
            environmentalAspects: true,
            equipment: true,
            energyConsumptions: true,
            audits: true,
            locationAudits: true,
            reports: true,
          },
        },
      },
    });
    if (!l) throw new UserError("Vestiging niet gevonden.");
    const used = Object.values(l._count).reduce((n, v) => n + v, 0);
    if (used) throw new UserError(`"${l.name}" wordt nog gebruikt (${used} koppeling(en)). Zet de vestiging op 'niet actief' in plaats van verwijderen.`);
    await prisma.location.delete({ where: { id } });
    await logAudit({ user, action: "DELETE", entityType: "Location", entityId: id, summary: `Vestiging "${l.name}" verwijderd` });
    revalidateMasterData();
    redirect("/beheer/vestigingen");
  });
}

export async function updateDiscipline(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("masterdata.edit");
    const { active, aliases, ...data } = parseForm(disciplineSchema.extend({ active: z.literal("on").optional() }), formData);
    const old = await prisma.discipline.findUnique({ where: { id } });
    if (!old) throw new UserError("Bedrijfsonderdeel niet gevonden.");
    if (data.name !== old.name && (await prisma.discipline.findUnique({ where: { name: data.name } })))
      throw new UserError(`Er is al een bedrijfsonderdeel "${data.name}".`);
    // De oude naam blijft herkenbaar bij import (bijv. "Afvalrecycling" na hernoemen).
    const aliasList = splitList(aliases);
    if (old.name !== data.name && !aliasList.some((a) => a.toLowerCase() === old.name.toLowerCase())) aliasList.push(old.name);
    await prisma.discipline.update({ where: { id }, data: { ...data, aliases: aliasList, active: active === "on" } });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "Discipline",
      entityId: id,
      summary: old.name !== data.name ? `Bedrijfsonderdeel "${old.name}" hernoemd naar "${data.name}"` : `Bedrijfsonderdeel "${data.name}" gewijzigd`,
    });
    revalidateMasterData();
    redirect("/beheer/bedrijfsonderdelen");
  });
}

export async function deleteDiscipline(id: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("masterdata.edit");
    const d = await prisma.discipline.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            actions: true,
            risks: true,
            legalRequirements: true,
            environmentalAspects: true,
            processes: true,
            energyConsumptions: true,
            reports: true,
            equipment: true,
            reductionTargets: true,
            audits: true,
            suppliers: true,
          },
        },
      },
    });
    if (!d) throw new UserError("Bedrijfsonderdeel niet gevonden.");
    const used = Object.values(d._count).reduce((n, v) => n + v, 0);
    if (used) throw new UserError(`"${d.name}" wordt nog gebruikt (${used} koppeling(en)). Zet het op 'niet actief' in plaats van verwijderen.`);
    await prisma.discipline.delete({ where: { id } });
    await logAudit({ user, action: "DELETE", entityType: "Discipline", entityId: id, summary: `Bedrijfsonderdeel "${d.name}" verwijderd` });
    revalidateMasterData();
    redirect("/beheer/bedrijfsonderdelen");
  });
}

export async function updateJobFunction(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("masterdata.edit");
    const data = parseForm(schemas.jobFunction, formData);
    const old = await prisma.jobFunction.findUnique({ where: { id } });
    if (!old) throw new UserError("Functie niet gevonden.");
    if (data.name !== old.name && (await prisma.jobFunction.findUnique({ where: { name: data.name } })))
      throw new UserError(`Er is al een functie "${data.name}".`);
    await prisma.jobFunction.update({ where: { id }, data });
    await logAudit({ user, action: "UPDATE", entityType: "JobFunction", entityId: id, summary: `Functie "${data.name}" gewijzigd` });
    revalidateMasterData();
    redirect("/beheer/functies");
  });
}

const userSchema = z.object({ name: requiredText(200), jobFunctionId: optionalId, active: z.literal("on").optional() });

/** Naam, functie en actief-status van een gebruiker (de rol komt uit Microsoft 365 of de inlogmodus). */
export async function updateUserMasterData(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("masterdata.edit");
    const { active, ...data } = parseForm(userSchema, formData);
    if (id === user.id && active !== "on") throw new UserError("Je kunt jezelf niet op niet actief zetten.");
    await prisma.user.update({ where: { id }, data: { ...data, active: active === "on" } });
    await logAudit({ user, action: "UPDATE", entityType: "User", entityId: id, summary: `Gebruiker "${data.name}" gewijzigd` });
    revalidateMasterData();
    redirect("/beheer/gebruikers");
  });
}
