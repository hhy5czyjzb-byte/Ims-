"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { safeAction, UserError, type ActionResult } from "@/lib/action-result";
import { optionalId, optionalText, parseForm, requiredText } from "@/lib/forms";
import { CO2_SETTINGS_KEY, getCo2Settings } from "@/lib/co2-settings";
import { diffFields } from "@/lib/audit-diff";
import { parseDecimal } from "@/lib/co2";

const decimal = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const p = parseDecimal(v);
    if (p.invalid || p.value === null) {
      ctx.addIssue({ code: "custom", message: "Vul een getal in" });
      return z.NEVER;
    }
    return p.value;
  });

function revalidate() {
  revalidatePath("/co2", "layout");
  revalidatePath("/");
}

export async function saveCo2Settings(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("co2.manage");
    const data = parseForm(
      z.object({ emissionType: z.enum(["WTW", "TTW"]), locationBasedCarrierId: optionalId, intensityKpi: z.enum(["FTE", "REVENUE"]) }),
      formData,
    );
    const before = await getCo2Settings();
    const value = JSON.stringify({ ...data, locationBasedCarrierId: data.locationBasedCarrierId ?? null });
    const changes = diffFields(
      before,
      { ...data, locationBasedCarrierId: data.locationBasedCarrierId ?? null },
      { emissionType: "Type uitstoot", locationBasedCarrierId: "Location-based factor", intensityKpi: "Intensiteit" },
    );
    await prisma.appSetting.upsert({
      where: { key: CO2_SETTINGS_KEY },
      create: { key: CO2_SETTINGS_KEY, value, updatedById: user.id },
      update: { value, updatedById: user.id },
    });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "AppSetting",
      entityId: CO2_SETTINGS_KEY,
      summary: `CO2-instellingen gewijzigd (type uitstoot ${data.emissionType})`,
      details: { changes },
    });
    revalidate();
  });
}

const orgSchema = z.object({ name: requiredText(200), boundaryPct: decimal.pipe(z.number().min(0).max(100)) });

export async function createOrganisation(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("co2.manage");
    const data = parseForm(orgSchema, formData);
    const o = await prisma.co2Organisation.create({ data });
    await logAudit({
      user,
      action: "CREATE",
      entityType: "Co2Organisation",
      entityId: o.id,
      summary: `Organisatie "${o.name}" (${data.boundaryPct}% in boundary) toegevoegd`,
    });
    revalidate();
  });
}

export async function updateOrganisation(id: string, formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("co2.manage");
    const data = parseForm(orgSchema.extend({ active: z.literal("on").optional() }), formData);
    const { active, ...rest } = data;
    await prisma.co2Organisation.update({ where: { id }, data: { ...rest, active: active === "on" } });
    await logAudit({
      user,
      action: "UPDATE",
      entityType: "Co2Organisation",
      entityId: id,
      summary: `Organisatie "${rest.name}" gewijzigd (${rest.boundaryPct}% in boundary)`,
    });
    revalidate();
  });
}

const kpiSchema = z.object({
  year: z.coerce.number().int().min(1990).max(2100),
  kind: z.enum(["FTE", "REVENUE", "KM", "OTHER"]),
  value: decimal,
  label: optionalText,
  organisationId: optionalId,
});

export async function saveKpi(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("co2.manage");
    const data = parseForm(kpiSchema, formData);
    const existing = await prisma.co2Kpi.findFirst({ where: { year: data.year, kind: data.kind, organisationId: data.organisationId ?? null } });
    if (existing) await prisma.co2Kpi.update({ where: { id: existing.id }, data: { value: data.value, label: data.label } });
    else await prisma.co2Kpi.create({ data });
    await logAudit({
      user,
      action: existing ? "UPDATE" : "CREATE",
      entityType: "Co2Kpi",
      summary: `Kengetal ${data.kind} ${data.year} = ${data.value}`,
      details: existing ? { changes: diffFields(existing, data, { value: "Waarde" }) } : undefined,
    });
    revalidate();
  });
}

export async function deleteKpi(id: string): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("co2.manage");
    const k = await prisma.co2Kpi.findUnique({ where: { id } });
    if (!k) throw new UserError("Kengetal niet gevonden.");
    await prisma.co2Kpi.delete({ where: { id } });
    await logAudit({ user, action: "DELETE", entityType: "Co2Kpi", entityId: id, summary: `Kengetal ${k.kind} ${k.year} verwijderd` });
    revalidate();
  });
}
