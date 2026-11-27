import type { Applicability, ComplianceStatus, ImpactLevel, ImplementationStatus, LegalCategory } from "@prisma/client";
import { normText as norm, type ImportField } from "@/lib/spreadsheet-import";

/**
 * Import van het register wet- en regelgeving: velden en herkenning van status en categorie.
 * De algemene importfuncties staan in spreadsheet-import.ts.
 */

export const LEGAL_IMPORT_FIELDS: ImportField[] = [
  { key: "externalRef", label: "Kenmerk / nr. in bronregister", hints: ["nr", "nummer", "kenmerk", "id", "code", "ref", "referentie", "volgnummer"] },
  {
    key: "title",
    label: "Wet / regeling",
    required: true,
    hints: ["wet of regelgeving", "wet en regelgeving", "wet", "regeling", "wetgeving", "besluit", "titel", "wettelijke eis"],
  },
  { key: "article", label: "Artikel / onderdeel", hints: ["artikel", "art", "onderdeel", "hoofdstuk", "paragraaf", "voorschrift"] },
  { key: "theme", label: "Thema", hints: ["thema", "rubriek", "domein"] },
  { key: "regulationType", label: "Soort regelgeving (wet, besluit, norm, …)", hints: ["categorie", "soort", "soort regelgeving", "type"] },
  { key: "subject", label: "Onderwerp / toepassing", hints: ["toepassing bij rouwmaat", "toepassing", "onderwerp", "aspect"] },
  { key: "applicability", label: "Van toepassing", preview: "applicability", hints: ["van toepassing", "toepasselijk"] },
  { key: "appliesIso14001", label: "Geldt voor ISO 14001", preview: "yesNo", hints: ["iso 14001", "14001"] },
  { key: "appliesCo2", label: "Geldt voor CO₂-prestatieladder", preview: "yesNo", hints: ["co pl", "co2 pl", "co2 prestatieladder", "co prestatieladder"] },
  { key: "appliesVca", label: "Geldt voor VCA / arbo", preview: "yesNo", hints: ["vca arbo", "vca"] },
  { key: "appliesIso9001", label: "Geldt voor ISO 9001", preview: "yesNo", hints: ["iso 9001", "9001"] },
  {
    key: "description",
    label: "Eis / kernverplichting",
    hints: ["kernverplichtingen", "kernverplichting", "eis", "omschrijving", "verplichting", "inhoud", "beschrijving"],
  },
  { key: "evidence", label: "Bewijslast", hints: ["bewijslast", "bewijs", "bewijsvoering"] },
  { key: "owner", label: "Eigenaar (en frequentie)", hints: ["eigenaar en frequentie", "eigenaar", "verantwoordelijk", "verantwoordelijke", "owner"] },
  { key: "implementationStatus", label: "Status (uitvoering)", preview: "implementationStatus", hints: ["status", "implementatie", "uitvoering"] },
  {
    key: "status",
    label: "Compliancebeoordeling",
    preview: "legalStatus",
    hints: ["compliancebeoordeling", "compliancestatus", "beoordeling", "voldoet", "naleving", "oordeel"],
  },
  { key: "explanation", label: "Toelichting / actie", hints: ["toelichting", "actie", "opmerking", "opmerkingen", "onderbouwing"] },
  { key: "nextStep", label: "Volgende stap", hints: ["volgende stap", "vervolgstap"] },
  { key: "impact", label: "Impact", preview: "impactLevel", hints: ["impact"] },
  {
    key: "lastReviewDate",
    label: "Datum laatste toetsing",
    kind: "date",
    hints: ["laatste controle", "laatste toetsing", "datum toetsing", "datum laatste", "laatst getoetst"],
  },
  { key: "nextReviewDate", label: "Volgende toetsing", kind: "date", hints: ["volgende controle", "volgende toetsing", "herbeoordeling", "hertoetsing"] },
  { key: "riskRefs", label: "Risicoregister (nummers)", hints: ["risicoregister", "risico s", "risico nr", "risico"] },
  { key: "origin", label: "Herkomst", hints: ["herkomst"] },
  { key: "source", label: "Bevoegd gezag", hints: ["bevoegd gezag", "gezag", "instantie", "toezichthouder"] },
  { key: "sourceUrl", label: "Bron / link (https)", hints: ["bron", "link", "url", "website", "vindplaats"] },
  { key: "discipline", label: "Discipline", hints: ["discipline", "afdeling", "bedrijfsonderdeel", "divisie"] },
  { key: "location", label: "Locatie", hints: ["locatie", "vestiging", "inrichting"] },
];

/** Compliancestatus uit vrije tekst; `null` = niet herkend. Lege cel = nog niet getoetst. */
export function parseStatus(value: unknown): ComplianceStatus | null {
  const v = norm(String(value ?? ""));
  if (!v) return "NOT_ASSESSED";
  if (/^(n v t|nvt|niet van toepassing|na|n a|not applicable)$/.test(v)) return "NOT_APPLICABLE";
  if (/(voldoet niet|niet voldaan|non ?compliant|nee|^niet$|^nok$|^rood$|^red$|^no$)/.test(v)) return "NON_COMPLIANT";
  if (/(deels|gedeeltelijk|ten dele|partial|^oranje$|^geel$|^amber$|^orange$)/.test(v)) return "PARTIAL";
  if (/(voldoet|voldaan|^ja$|^ok$|^groen$|^green$|conform|compliant|^yes$|^v$|^x$)/.test(v)) return "COMPLIANT";
  if (/(niet getoetst|nog toetsen|te beoordelen|nog beoordelen|onbekend|open|^\?$)/.test(v)) return "NOT_ASSESSED";
  return null;
}

/** Categorie op trefwoorden; onbekend → OTHER. */
export function parseCategory(value: unknown): LegalCategory {
  const v = norm(String(value ?? ""));
  if (/(milieu|omgeving|bodem|water|lucht|afval|geluid|natuur|emissie|bal\b|activiteitenbesluit)/.test(v)) return "ENVIRONMENT";
  if (/(arbo|veilig|gezondheid|vca|scl|asbest|brandveilig|gevaarlijke stoffen|machine|arbeidsmiddel)/.test(v)) return "HEALTH_SAFETY";
  if (/(energie|co2|klimaat)/.test(v)) return "ENERGY_CO2";
  if (/(product|brl|bouwstof|kwaliteit|ce markering)/.test(v)) return "PRODUCT";
  if (/(bouw|bbl|bouwbesluit)/.test(v)) return "BUILDING";
  return "OTHER";
}

/** Van toepassing: Ja / Voorwaardelijk / Nog bepalen / Nee. */
export function parseApplicability(value: unknown): Applicability | null {
  const v = norm(String(value ?? ""));
  if (!v) return null;
  if (/^(ja|yes|j)$/.test(v)) return "YES";
  if (/voorwaardelijk|soms|situatie/.test(v)) return "CONDITIONAL";
  if (/nog bepalen|te bepalen|onbekend/.test(v)) return "TO_DETERMINE";
  if (/^(nee|no|n|niet)$/.test(v)) return "NO";
  return null;
}

/** Stand van de uitvoering: Geïmplementeerd / In opzet / Actie nodig / N.v.t. */
export function parseImplementationStatus(value: unknown): ImplementationStatus | null {
  const v = norm(String(value ?? ""));
  if (!v) return null;
  if (/geimplementeerd|ingevoerd|gereed/.test(v)) return "IMPLEMENTED";
  if (/in opzet|in uitvoering|bezig/.test(v)) return "IN_PROGRESS";
  if (/actie nodig|actie vereist/.test(v)) return "ACTION_NEEDED";
  if (/^(n v t|nvt|niet van toepassing)$/.test(v)) return "NOT_APPLICABLE";
  return null;
}

export function parseImpact(value: unknown): ImpactLevel | null {
  const v = norm(String(value ?? ""));
  if (/^hoog/.test(v)) return "HIGH";
  if (/^(middel|midden|gemiddeld)/.test(v)) return "MEDIUM";
  if (/^laag/.test(v)) return "LOW";
  return null;
}
