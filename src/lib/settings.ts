import { prisma } from "@/lib/db";
import { DEFAULT_SIGNIFICANCE_THRESHOLD, SIGNIFICANCE_THRESHOLD_KEY } from "@/lib/aspects";

/** Drempel voor significantie van milieuaspecten (instelbaar door KAM). */
export async function getSignificanceThreshold(): Promise<number> {
  const row = await prisma.appSetting.findUnique({ where: { key: SIGNIFICANCE_THRESHOLD_KEY } });
  const n = row ? Number(row.value) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 125 ? n : DEFAULT_SIGNIFICANCE_THRESHOLD;
}
