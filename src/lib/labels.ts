import type { ActionPriority, ActionSource, ActionStatus, NormCategory, RaciType, Role } from "@prisma/client";

/** Nederlandse labels voor enums. */
export const ROLE_LABEL: Record<Role, string> = {
  KAM: "KAM",
  DIRECTIE: "Directie",
  MIDDENKADER: "Middenkader",
};

export const NORM_CATEGORY_LABEL: Record<NormCategory, string> = {
  QUALITY: "Kwaliteit",
  ENVIRONMENT: "Milieu",
  SAFETY: "Veiligheid",
  CO2: "CO2 / energie",
  PRODUCT: "Product / proces (BRL)",
  OTHER: "Overig",
};

export const ACTION_STATUS_LABEL: Record<ActionStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In uitvoering",
  DONE: "Gereed",
  CANCELLED: "Vervallen",
};

export const ACTION_STATUS_CLASS: Record<ActionStatus, string> = {
  OPEN: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  DONE: "bg-green-100 text-green-800",
  CANCELLED: "bg-neutral-200 text-neutral-600",
};

export const ACTION_PRIORITY_LABEL: Record<ActionPriority, string> = {
  LOW: "Laag",
  MEDIUM: "Normaal",
  HIGH: "Hoog",
};

export const ACTION_SOURCE_LABEL: Record<ActionSource, string> = {
  MANUAL: "Handmatig",
  AUDIT: "Audit",
  RISK: "Risico / kans",
  COMPLIANCE: "Wet- en regelgeving",
  NONCONFORMITY: "Afwijking",
  MANAGEMENT_REVIEW: "Directiebeoordeling",
  COMPLAINT: "Klacht",
  OTHER: "Overig",
};

export const RACI_LABEL: Record<RaciType, string> = {
  R: "Responsible — voert uit",
  A: "Accountable — eindverantwoordelijk",
  C: "Consulted — wordt geraadpleegd",
  I: "Informed — wordt geïnformeerd",
};

export const RACI_CLASS: Record<RaciType, string> = {
  R: "bg-brand-red text-white",
  A: "bg-brand-red-dark text-white",
  C: "bg-brand-grey-light text-neutral-900",
  I: "bg-neutral-100 text-neutral-700 border border-neutral-300",
};

export function options<T extends string>(labels: Record<T, string>) {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}
