import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type AuditAction = "LOGIN" | "VIEW" | "CREATE" | "UPDATE" | "DELETE" | "SYNC";

/**
 * Schrijf een regel in de audit trail. Faalt nooit hard: een logfout mag de
 * gebruiker niet blokkeren, maar wordt wel naar de serverlog geschreven.
 */
export async function logAudit(entry: {
  user?: { id?: string | null; email?: string | null } | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  summary?: string;
  details?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.user?.id || undefined,
        userEmail: entry.user?.email ?? undefined,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? undefined,
        summary: entry.summary,
        details: entry.details,
      },
    });
  } catch (err) {
    console.error("[audit] schrijven mislukt", err);
  }
}
