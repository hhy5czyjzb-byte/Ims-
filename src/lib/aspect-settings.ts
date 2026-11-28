import { prisma } from "@/lib/db";
import { parseSignificanceRule, SIGNIFICANCE_RULE_KEY, type SignificanceRule } from "@/lib/aspects";

/** De ingestelde regel voor significantie van milieuaspecten (standaard: prio H of M). */
export async function getSignificanceRule(): Promise<SignificanceRule> {
  const row = await prisma.appSetting.findUnique({ where: { key: SIGNIFICANCE_RULE_KEY } });
  return parseSignificanceRule(row?.value);
}
