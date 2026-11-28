import { z } from "zod";
import { prisma } from "@/lib/db";

/**
 * Gegevens van het plan van aanpak die niet bij een maatregel horen (zoals in het CO2-dashboard):
 * de energiebeoordeling met haar onderdelen en de doelstelling uit "PVA - berekening doelstelling"
 * (teksten, verdeling per scope, tussendoelstellingen). Opgeslagen in AppSetting `co2.pva`.
 */
export const CO2_PVA_KEY = "co2.pva";

const pct = z.number().finite().min(-1000).max(1000).nullable();
export const pvaTargetSchema = z.object({
  organisation: z.string().max(200).nullable(),
  lastTargetYear: z.number().int().nullable(),
  baseYear: z.number().int().nullable(),
  targetYear: z.number().int().nullable(),
  emissionType: z.string().max(20).nullable(),
  textAll: z.string().max(2000).nullable(),
  text12: z.string().max(2000).nullable(),
  totalCo2Pct: pct,
  totalGjPct: pct,
  scopes: z
    .array(
      z.object({ scope: z.union([z.literal(1), z.literal(2), z.literal(3)]), totalCo2Pct: pct, totalGjPct: pct, potentialCo2Pct: pct, potentialGjPct: pct }),
    )
    .max(3),
  milestones: z.array(z.object({ year: z.number().int(), scope1: pct, scope2: pct, scope3: pct, total: pct, lastTarget: pct, energy: pct })).max(30),
});
export const pvaDocSchema = z.object({
  intro: z.string().max(4000).nullable(),
  sections: z.array(z.object({ title: z.string().max(200), text: z.string().max(8000).nullable() })).max(20),
});
export const pvaSettingsSchema = z.object({
  doc: pvaDocSchema.nullable().default(null),
  target: pvaTargetSchema.nullable().default(null),
  importedAt: z.string().nullable().default(null),
});
export type PvaSettings = z.infer<typeof pvaSettingsSchema>;
export type PvaTargetData = z.infer<typeof pvaTargetSchema>;

export function parsePvaSettings(value: string | null | undefined): PvaSettings {
  try {
    return pvaSettingsSchema.parse(value ? JSON.parse(value) : {});
  } catch {
    return { doc: null, target: null, importedAt: null };
  }
}

export async function getPvaSettings(): Promise<PvaSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: CO2_PVA_KEY } });
  return parsePvaSettings(row?.value);
}
