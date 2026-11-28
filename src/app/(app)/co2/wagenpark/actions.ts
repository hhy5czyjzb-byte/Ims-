"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { safeAction, UserError, type ActionResult } from "@/lib/action-result";
import { FUEL_TYPES, VEHICLE_TYPES, fuelLabel, vehicleLabel } from "@/lib/fleet";

/** Aantallen voor één jaar opslaan (raster soort voertuig × brandstof); 0 of leeg verwijdert de regel. */
export async function saveFleetYear(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requirePermission("co2.manage");
    const year = Number(formData.get("year"));
    if (!Number.isInteger(year) || year < 1990 || year > 2100) throw new UserError("Vul een geldig jaar in.");
    const existing = await prisma.fleetCount.findMany({ where: { year } });
    const changes: { field: string; label: string; from: string; to: string }[] = [];
    for (const v of VEHICLE_TYPES)
      for (const f of FUEL_TYPES) {
        const raw = String(formData.get(`c_${v.key}_${f.key}`) ?? "").trim();
        if (raw === "" && !existing.some((e) => e.vehicleType === v.key && e.fuelType === f.key)) continue;
        const n = raw === "" ? 0 : Number(raw);
        if (!Number.isInteger(n) || n < 0 || n > 100_000) throw new UserError(`${vehicleLabel(v.key)} – ${fuelLabel(f.key)}: vul een heel getal in.`);
        const old = existing.find((e) => e.vehicleType === v.key && e.fuelType === f.key);
        if ((old?.count ?? 0) === n) continue;
        changes.push({ field: `${v.key}_${f.key}`, label: `${vehicleLabel(v.key)} – ${fuelLabel(f.key)}`, from: String(old?.count ?? 0), to: String(n) });
        if (n === 0) {
          if (old) await prisma.fleetCount.delete({ where: { id: old.id } });
        } else
          await prisma.fleetCount.upsert({
            where: { year_vehicleType_fuelType: { year, vehicleType: v.key, fuelType: f.key } },
            create: { year, vehicleType: v.key, fuelType: f.key, count: n },
            update: { count: n },
          });
      }
    if (changes.length)
      await logAudit({
        user,
        action: "UPDATE",
        entityType: "FleetCount",
        entityId: String(year),
        summary: `Wagenpark ${year} bijgewerkt (${changes.length} wijziging(en))`,
        details: { changes },
      });
    revalidatePath("/co2/wagenpark");
  });
}
