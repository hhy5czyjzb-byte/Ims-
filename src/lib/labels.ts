import type {
  AbsenceClass,
  ObjectiveCategory,
  ObjectiveStatus,
  ActionKind,
  ActionPriority,
  ActionSource,
  ActionStatus,
  Applicability,
  AspectPriority,
  AspectSiteType,
  AspectType,
  AuditStatus,
  AuditType,
  ChecklistResult,
  ComplianceStatus,
  ContextAnalysisStatus,
  ContextFactorKind,
  EnergyCategory,
  FindingClass,
  FindingStatus,
  ImpactLevel,
  ImplementationStatus,
  InjuryLevel,
  LegalCategory,
  NormCategory,
  ObligationCharacter,
  OperatingSituation,
  RaciType,
  ReportOrigin,
  ReportSeverity,
  ReportStatus,
  ReportType,
  RiskCategory,
  RiskStatus,
  RiskType,
  Role,
  StakeholderType,
  TreatmentStatus,
} from "@prisma/client";

/** Nederlandse labels voor enums. */
export const ROLE_LABEL: Record<Role, string> = {
  QHSE: "QHSE",
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
  ENVIRONMENTAL_ASPECT: "Milieuaspect",
  CO2_REDUCTION: "CO2-reductie",
  LOCATION_AUDIT: "Compliance-audit vestiging",
  INCIDENT: "Ongeval / incident",
  NONCONFORMITY: "Afwijking / NC",
  MANAGEMENT_REVIEW: "Directiebeoordeling",
  OBJECTIVE: "Doelstelling",
  COMPLAINT: "Klacht",
  OTHER: "Overig",
};

export const ACTION_KIND_LABEL: Record<ActionKind, string> = {
  TASK: "Taak",
  CORRECTION: "Correctie (direct oplossen)",
  CORRECTIVE: "Corrigerende maatregel (oorzaak wegnemen)",
  IMPROVEMENT: "Verbetering / preventief",
};

export const REPORT_TYPE_LABEL: Record<ReportType, string> = {
  NONCONFORMITY: "Afwijking / NC",
  COMPLAINT: "Klacht",
  ACCIDENT: "Ongeval",
  NEAR_MISS: "Bijna-ongeval",
  UNSAFE_SITUATION: "Onveilige situatie / handeling",
  ENVIRONMENTAL_INCIDENT: "Milieu-incident",
  DAMAGE: "Schade",
  IMPROVEMENT: "Verbetervoorstel",
  OTHER: "Overig",
};
export const REPORT_TYPE_CLASS: Record<ReportType, string> = {
  NONCONFORMITY: "bg-amber-100 text-amber-800",
  COMPLAINT: "bg-sky-100 text-sky-800",
  ACCIDENT: "bg-brand-red text-white",
  NEAR_MISS: "bg-red-100 text-brand-red-dark",
  UNSAFE_SITUATION: "bg-orange-100 text-orange-800",
  ENVIRONMENTAL_INCIDENT: "bg-green-100 text-green-800",
  DAMAGE: "bg-neutral-200 text-neutral-800",
  IMPROVEMENT: "bg-violet-100 text-violet-800",
  OTHER: "bg-neutral-100 text-neutral-700",
};
export const REPORT_ORIGIN_LABEL: Record<ReportOrigin, string> = {
  INTERNAL: "Intern",
  CUSTOMER: "Klant / opdrachtgever",
  SUPPLIER: "Leverancier / onderaannemer",
  EXTERNAL_AUDIT: "Externe audit / certificatie-instelling",
  AUTHORITY: "Bevoegd gezag / inspectie",
  NEIGHBOUR: "Omwonenden / omgeving",
  OTHER: "Overig",
};
export const REPORT_SEVERITY_LABEL: Record<ReportSeverity, string> = { LOW: "Laag", MEDIUM: "Middel", HIGH: "Hoog", SEVERE: "Ernstig" };
export const REPORT_SEVERITY_CLASS: Record<ReportSeverity, string> = {
  LOW: "bg-neutral-100 text-neutral-700",
  MEDIUM: "bg-amber-100 text-amber-800",
  HIGH: "bg-red-100 text-brand-red-dark",
  SEVERE: "bg-brand-red text-white",
};
export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = { NEW: "Nieuw", IN_PROGRESS: "In behandeling", CLOSED: "Afgesloten", REJECTED: "Afgewezen" };
export const REPORT_STATUS_CLASS: Record<ReportStatus, string> = {
  NEW: "bg-sky-100 text-sky-800",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  CLOSED: "bg-green-100 text-green-800",
  REJECTED: "bg-neutral-100 text-neutral-600",
};
export const ABSENCE_LABEL: Record<AbsenceClass, string> = { SHORT: "Verzuim 1–15 dagen", LONG: "Verzuim meer dan 15 dagen" };
export const ABSENCE_CLASS: Record<AbsenceClass, string> = { SHORT: "bg-amber-100 text-amber-900", LONG: "bg-brand-red text-white" };
export const INJURY_LEVEL_LABEL: Record<InjuryLevel, string> = {
  NONE: "Geen letsel",
  FIRST_AID: "EHBO",
  MEDICAL: "Medische behandeling",
  LOST_TIME: "Verzuim",
  PERMANENT: "Blijvend letsel",
  FATAL: "Dodelijk",
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

export const RISK_TYPE_LABEL: Record<RiskType, string> = {
  RISK: "Risico",
  OPPORTUNITY: "Kans",
};

export const RISK_CATEGORY_LABEL: Record<RiskCategory, string> = {
  STRATEGIC: "Strategisch / bedrijfsvoering",
  QUALITY: "Kwaliteit",
  ENVIRONMENT: "Milieu",
  SAFETY: "Veiligheid en gezondheid (RI&E)",
  CO2: "CO2 / energie",
  COMPLIANCE: "Wet- en regelgeving",
  OTHER: "Overig",
};

export const RISK_STATUS_LABEL: Record<RiskStatus, string> = {
  OPEN: "Open — maatregelen nodig",
  CONTROLLED: "Beheerst",
  CLOSED: "Afgesloten",
};

export const RISK_STATUS_CLASS: Record<RiskStatus, string> = {
  OPEN: "bg-blue-100 text-blue-800",
  CONTROLLED: "bg-green-100 text-green-800",
  CLOSED: "bg-neutral-200 text-neutral-600",
};

export const AUDIT_TYPE_LABEL: Record<AuditType, string> = {
  INTERNAL: "Interne audit",
  EXTERNAL: "Externe audit (certificatie-instelling)",
  CUSTOMER: "Klantaudit",
};

export const AUDIT_TYPE_SHORT: Record<AuditType, string> = { INTERNAL: "Intern", EXTERNAL: "Extern", CUSTOMER: "Klant" };

export const AUDIT_TYPE_CLASS: Record<AuditType, string> = {
  INTERNAL: "bg-brand-grey-light text-neutral-900",
  EXTERNAL: "bg-neutral-800 text-white",
  CUSTOMER: "bg-amber-100 text-amber-900",
};

export const AUDIT_STATUS_LABEL: Record<AuditStatus, string> = {
  PLANNED: "Gepland",
  IN_PROGRESS: "In uitvoering",
  COMPLETED: "Afgerond",
  CANCELLED: "Geannuleerd",
};

export const AUDIT_STATUS_CLASS: Record<AuditStatus, string> = {
  PLANNED: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-neutral-200 text-neutral-600",
};

export const FINDING_CLASS_LABEL: Record<FindingClass, string> = {
  MAJOR: "Major (grote tekortkoming)",
  MINOR: "Minor (kleine tekortkoming)",
  OBSERVATION: "Observatie / verbeterpunt",
};

export const FINDING_CLASS_SHORT: Record<FindingClass, string> = { MAJOR: "Major", MINOR: "Minor", OBSERVATION: "Observatie" };

export const FINDING_CLASS_CLASS: Record<FindingClass, string> = {
  MAJOR: "bg-brand-red text-white",
  MINOR: "bg-orange-100 text-orange-800",
  OBSERVATION: "bg-sky-100 text-sky-800",
};

export const FINDING_STATUS_LABEL: Record<FindingStatus, string> = { OPEN: "Open", CLOSED: "Afgehandeld" };

export const CHECKLIST_RESULT_LABEL: Record<ChecklistResult, string> = {
  NOT_ASSESSED: "Nog niet getoetst",
  CONFORM: "Conform",
  FINDING: "Bevinding",
  NOT_APPLICABLE: "Niet van toepassing",
};

export const CHECKLIST_RESULT_CLASS: Record<ChecklistResult, string> = {
  NOT_ASSESSED: "bg-neutral-100 text-neutral-600",
  CONFORM: "bg-green-100 text-green-800",
  FINDING: "bg-orange-100 text-orange-800",
  NOT_APPLICABLE: "bg-neutral-200 text-neutral-500",
};

export const COMPLIANCE_STATUS_LABEL: Record<ComplianceStatus, string> = {
  NOT_ASSESSED: "Nog niet getoetst",
  COMPLIANT: "Voldoet",
  PARTIAL: "Voldoet deels",
  NON_COMPLIANT: "Voldoet niet",
  NOT_APPLICABLE: "Niet van toepassing",
};

export const COMPLIANCE_STATUS_CLASS: Record<ComplianceStatus, string> = {
  NOT_ASSESSED: "bg-neutral-100 text-neutral-600",
  COMPLIANT: "bg-green-100 text-green-800",
  PARTIAL: "bg-amber-100 text-amber-800",
  NON_COMPLIANT: "bg-brand-red text-white",
  NOT_APPLICABLE: "bg-neutral-200 text-neutral-500",
};

export const LEGAL_CATEGORY_LABEL: Record<LegalCategory, string> = {
  ENVIRONMENT: "Milieu en omgeving",
  HEALTH_SAFETY: "Arbo en veiligheid",
  PRODUCT: "Product en kwaliteit",
  ENERGY_CO2: "Energie en CO2",
  BUILDING: "Bouwen",
  OTHER: "Overig",
};

export const ASPECT_TYPE_LABEL: Record<AspectType, string> = {
  AIR: "Lucht / stof / emissies",
  NOISE: "Geluid",
  SOIL: "Bodem",
  WATER: "Water / lozingen",
  ENERGY: "Energie / brandstof",
  WASTE: "Afval",
  RESOURCES: "Grondstoffen en materialen",
  ODOUR: "Geur",
  VIBRATION: "Trillingen",
  LIGHT: "Licht",
  TRANSPORT: "Transport en verkeer",
  OTHER: "Overig",
};

export const ASPECT_PRIORITY_LABEL: Record<AspectPriority, string> = {
  HIGH: "Hoog",
  MEDIUM: "Middel",
  LOW: "Laag",
};

export const ASPECT_PRIORITY_SHORT: Record<AspectPriority, string> = { HIGH: "H", MEDIUM: "M", LOW: "L" };

export const ASPECT_PRIORITY_CLASS: Record<AspectPriority, string> = {
  HIGH: "bg-brand-red text-white",
  MEDIUM: "bg-amber-100 text-amber-800",
  LOW: "bg-neutral-100 text-neutral-600",
};

export const ASPECT_SITE_TYPE_LABEL: Record<AspectSiteType, string> = {
  SITE: "Vestiging",
  PROJECT: "Project",
  GROUP: "Groep",
};

export const CONTEXT_FACTOR_KIND_LABEL: Record<ContextFactorKind, string> = { EXTERNAL: "Extern", INTERNAL: "Intern" };

export const OBLIGATION_CHARACTER_LABEL: Record<ObligationCharacter, string> = {
  LEGAL: "Wettelijk",
  CONTRACTUAL: "Contractueel",
  VOLUNTARY: "Vrijwillig",
};
export const OBLIGATION_CHARACTER_CLASS: Record<ObligationCharacter, string> = {
  LEGAL: "bg-red-50 text-brand-red-dark ring-1 ring-brand-red/20",
  CONTRACTUAL: "bg-sky-50 text-sky-800 ring-1 ring-sky-200",
  VOLUNTARY: "bg-green-50 text-green-800 ring-1 ring-green-200",
};

export const STAKEHOLDER_TYPE_LABEL: Record<StakeholderType, string> = { INTERNAL: "Intern", EXTERNAL: "Extern" };

export const CONTEXT_STATUS_LABEL: Record<ContextAnalysisStatus, string> = { CONCEPT: "Concept", APPROVED: "Vastgesteld", SUPERSEDED: "Vervangen" };
export const CONTEXT_STATUS_CLASS: Record<ContextAnalysisStatus, string> = {
  CONCEPT: "bg-amber-100 text-amber-800",
  APPROVED: "bg-green-100 text-green-800",
  SUPERSEDED: "bg-neutral-100 text-neutral-600",
};

export const SITUATION_LABEL: Record<OperatingSituation, string> = {
  NORMAL: "Normaal",
  ABNORMAL: "Abnormaal",
  EMERGENCY: "Noodsituatie",
};

export const SITUATION_CLASS: Record<OperatingSituation, string> = {
  NORMAL: "bg-neutral-100 text-neutral-700",
  ABNORMAL: "bg-amber-100 text-amber-800",
  EMERGENCY: "bg-brand-red text-white",
};

export const ENERGY_CATEGORY_LABEL: Record<EnergyCategory, string> = {
  FUEL: "Brandstof",
  ELECTRICITY: "Elektriciteit",
  GAS: "Gas",
  HEAT: "Warmte",
  TRAVEL: "Zakelijk reizen",
  TRANSPORT: "Transport door derden",
  OTHER: "Overig",
};

export const SCOPE_LABEL: Record<1 | 2 | 3, string> = {
  1: "Scope 1 — directe emissies (eigen brandstof, gas)",
  2: "Scope 2 — ingekochte elektriciteit en warmte",
  3: "Zakelijk reizen (business travel: gedeclareerde kilometers, vliegreizen)",
};

export const TREATMENT_STATUS_LABEL: Record<TreatmentStatus, string> = {
  OPEN: "Open",
  PLANNED: "Gepland",
  IN_PROGRESS: "In uitvoering",
  ONGOING: "Doorlopend",
  DONE: "Afgerond",
};

export const TREATMENT_STATUS_CLASS: Record<TreatmentStatus, string> = {
  OPEN: "bg-blue-100 text-blue-800",
  PLANNED: "bg-sky-100 text-sky-800",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  ONGOING: "bg-neutral-100 text-neutral-700",
  DONE: "bg-green-100 text-green-800",
};

export const APPLICABILITY_LABEL: Record<Applicability, string> = {
  YES: "Ja",
  CONDITIONAL: "Voorwaardelijk",
  TO_DETERMINE: "Nog bepalen",
  NO: "Nee",
};

export const IMPLEMENTATION_STATUS_LABEL: Record<ImplementationStatus, string> = {
  IMPLEMENTED: "Geïmplementeerd",
  IN_PROGRESS: "In opzet",
  ACTION_NEEDED: "Actie nodig",
  NOT_APPLICABLE: "N.v.t.",
};

export const IMPLEMENTATION_STATUS_CLASS: Record<ImplementationStatus, string> = {
  IMPLEMENTED: "bg-green-100 text-green-800",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  ACTION_NEEDED: "bg-red-100 text-brand-red-dark",
  NOT_APPLICABLE: "bg-neutral-200 text-neutral-500",
};

export const IMPACT_LEVEL_LABEL: Record<ImpactLevel, string> = { HIGH: "Hoog", MEDIUM: "Middel", LOW: "Laag" };

export function options<T extends string>(labels: Record<T, string>) {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}

export const OBJECTIVE_CATEGORY_LABEL: Record<ObjectiveCategory, string> = {
  STRATEGIC: "Strategisch",
  QUALITY: "Kwaliteit en processen",
  CUSTOMER: "Klant en markt",
  ENVIRONMENT: "Milieu",
  CO2: "Energie en CO2",
  SAFETY: "Veiligheid",
  HEALTH: "Gezondheid en verzuim",
  PEOPLE: "Mensen en organisatie",
  COMPLIANCE: "Wet- en regelgeving en certificatie",
  OTHER: "Overig",
};
export const OBJECTIVE_CATEGORY_CLASS: Record<ObjectiveCategory, string> = {
  STRATEGIC: "bg-neutral-800 text-white",
  QUALITY: "bg-sky-100 text-sky-800",
  CUSTOMER: "bg-indigo-100 text-indigo-800",
  ENVIRONMENT: "bg-green-100 text-green-800",
  CO2: "bg-emerald-100 text-emerald-800",
  SAFETY: "bg-red-100 text-brand-red-dark",
  HEALTH: "bg-orange-100 text-orange-800",
  PEOPLE: "bg-violet-100 text-violet-800",
  COMPLIANCE: "bg-amber-100 text-amber-900",
  OTHER: "bg-neutral-100 text-neutral-700",
};
export const OBJECTIVE_STATUS_LABEL: Record<ObjectiveStatus, string> = {
  NOT_ASSESSED: "Nog niet beoordeeld",
  ON_TRACK: "Op koers",
  AT_RISK: "Aandacht nodig",
  OFF_TRACK: "Achter op schema",
  ACHIEVED: "Behaald",
  PARTIAL: "Deels behaald",
  NOT_ACHIEVED: "Niet behaald",
  CANCELLED: "Vervallen",
};
export const OBJECTIVE_STATUS_CLASS: Record<ObjectiveStatus, string> = {
  NOT_ASSESSED: "bg-neutral-100 text-neutral-600",
  ON_TRACK: "bg-green-100 text-green-800",
  AT_RISK: "bg-amber-100 text-amber-900",
  OFF_TRACK: "bg-red-100 text-brand-red-dark",
  ACHIEVED: "bg-green-600 text-white",
  PARTIAL: "bg-amber-400 text-neutral-900",
  NOT_ACHIEVED: "bg-brand-red text-white",
  CANCELLED: "bg-neutral-200 text-neutral-500 line-through",
};
