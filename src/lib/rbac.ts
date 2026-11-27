import type { Role } from "@prisma/client";

/**
 * Rolgebaseerde rechten. De ROL komt uit Entra ID-groepen (zie roleFromGroups);
 * de app beheert zelf geen rechten. Deze tabel bepaalt wat een rol mag.
 */
export const PERMISSIONS = {
  "norms.edit": ["KAM"],
  "processes.edit": ["KAM"],
  "documents.edit": ["KAM"],
  "masterdata.edit": ["KAM"],
  "actions.create": ["KAM", "MIDDENKADER", "DIRECTIE"],
  "actions.editAny": ["KAM"],
  "auditlog.view": ["KAM"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** Mag deze gebruiker deze actie wijzigen? KAM altijd; anderen alleen als eigenaar of aanmaker. */
export function canEditAction(user: { id: string; role: Role }, action: { ownerId: string | null; createdById: string | null }): boolean {
  if (can(user.role, "actions.editAny")) return true;
  return action.ownerId === user.id || action.createdById === user.id;
}

/**
 * Leid de rol af uit de Entra ID-groep-ID's in het token.
 * Hoogste rol wint (KAM > DIRECTIE > MIDDENKADER). Geen passende groep = geen toegang.
 */
export function roleFromGroups(groups: readonly string[] | undefined, config: { kam?: string; directie?: string; middenkader?: string }): Role | null {
  if (!groups?.length) return null;
  const has = (id?: string) => !!id && groups.includes(id);
  if (has(config.kam)) return "KAM";
  if (has(config.directie)) return "DIRECTIE";
  if (has(config.middenkader)) return "MIDDENKADER";
  return null;
}
