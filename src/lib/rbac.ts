import type { Role } from "@prisma/client";

/**
 * Rolgebaseerde rechten. De ROL komt uit Entra ID-groepen (zie roleFromGroups);
 * de app beheert zelf geen rechten. Deze tabel bepaalt wat een rol mag.
 */
export const PERMISSIONS = {
  "norms.edit": ["QHSE"],
  "processes.edit": ["QHSE"],
  "documents.edit": ["QHSE"],
  "masterdata.edit": ["QHSE"],
  "actions.create": ["QHSE", "MIDDENKADER", "DIRECTIE"],
  "actions.editAny": ["QHSE"],
  "risks.create": ["QHSE", "MIDDENKADER"],
  "risks.editAny": ["QHSE"],
  "audits.edit": ["QHSE"],
  "legal.edit": ["QHSE"],
  "aspects.edit": ["QHSE"],
  "co2.manage": ["QHSE"],
  "co2.enter": ["QHSE", "MIDDENKADER"],
  "context.edit": ["QHSE"],
  "context.approve": ["QHSE", "DIRECTIE"],
  "backup.manage": ["QHSE"],
  "auditlog.view": ["QHSE"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** Mag deze gebruiker deze actie wijzigen? QHSE altijd; anderen alleen als eigenaar of aanmaker. */
export function canEditAction(user: { id: string; role: Role }, action: { ownerId: string | null; createdById: string | null }): boolean {
  if (can(user.role, "actions.editAny")) return true;
  return action.ownerId === user.id || action.createdById === user.id;
}

/** Mag deze gebruiker dit risico wijzigen? QHSE altijd; middenkader alleen als eigenaar of aanmaker. */
export function canEditRisk(user: { id: string; role: Role }, risk: { ownerId: string | null; createdById: string | null }): boolean {
  if (can(user.role, "risks.editAny")) return true;
  if (!can(user.role, "risks.create")) return false;
  return risk.ownerId === user.id || risk.createdById === user.id;
}

/** Mag deze gebruiker een toetsing vastleggen? QHSE altijd; anderen alleen als eigenaar van de eis (directie niet). */
export function canAssessLegal(user: { id: string; role: Role }, req: { ownerId: string | null }): boolean {
  if (can(user.role, "legal.edit")) return true;
  return user.role === "MIDDENKADER" && req.ownerId === user.id;
}

/** Mag deze gebruiker een verbruiksregel wijzigen? QHSE altijd; middenkader alleen eigen invoer. */
export function canEditConsumption(user: { id: string; role: Role }, c: { createdById: string | null }): boolean {
  if (can(user.role, "co2.manage")) return true;
  return can(user.role, "co2.enter") && c.createdById === user.id;
}

/**
 * Leid de rol af uit de Entra ID-groep-ID's in het token.
 * Hoogste rol wint (QHSE > DIRECTIE > MIDDENKADER). Geen passende groep = geen toegang.
 */
export function roleFromGroups(groups: readonly string[] | undefined, config: { qhse?: string; directie?: string; middenkader?: string }): Role | null {
  if (!groups?.length) return null;
  const has = (id?: string) => !!id && groups.includes(id);
  if (has(config.qhse)) return "QHSE";
  if (has(config.directie)) return "DIRECTIE";
  if (has(config.middenkader)) return "MIDDENKADER";
  return null;
}
