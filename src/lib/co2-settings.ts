import { z } from "zod";
import { prisma } from "@/lib/db";
import type { EmissionType } from "@/lib/co2";

export const CO2_SETTINGS_KEY = "co2.settings";

const schema = z.object({
  emissionType: z.enum(["WTW", "TTW"]).default("WTW"),
  /** Energiedrager met de factor voor location-based scope 2 (gridmix NL). */
  locationBasedCarrierId: z.string().nullable().default(null),
  /** Kengetal voor de intensiteit (FTE of omzet). */
  intensityKpi: z.enum(["FTE", "REVENUE"]).default("FTE"),
});
export type Co2Settings = z.infer<typeof schema>;

export function parseCo2Settings(value: string | null | undefined): Co2Settings {
  try {
    return schema.parse(value ? JSON.parse(value) : {});
  } catch {
    return schema.parse({});
  }
}

export async function getCo2Settings(): Promise<Co2Settings> {
  const row = await prisma.appSetting.findUnique({ where: { key: CO2_SETTINGS_KEY } });
  return parseCo2Settings(row?.value);
}

export const asEmissionType = (s: Co2Settings): EmissionType => s.emissionType;
