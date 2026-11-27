import type { ComplianceStatus, LegalCategory } from "@prisma/client";
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
    hints: ["wet", "regeling", "wetgeving", "wet en regelgeving", "besluit", "titel", "naam", "wettelijke eis"],
  },
  { key: "article", label: "Artikel / onderdeel", hints: ["artikel", "art", "onderdeel", "hoofdstuk", "paragraaf", "voorschrift"] },
  { key: "subject", label: "Onderwerp", hints: ["onderwerp", "thema", "aspect"] },
  { key: "description", label: "Eis / omschrijving", hints: ["eis", "omschrijving", "verplichting", "inhoud", "beschrijving", "samenvatting", "eisen"] },
  { key: "source", label: "Bevoegd gezag / bron", hints: ["bevoegd gezag", "gezag", "bron", "instantie", "uitgever", "toezichthouder"] },
  { key: "sourceUrl", label: "Link (https)", hints: ["link", "url", "website", "vindplaats"] },
  { key: "category", label: "Categorie", preview: "legalCategory", hints: ["categorie", "soort", "type", "domein", "rubriek"] },
  { key: "discipline", label: "Discipline", hints: ["discipline", "afdeling", "bedrijfsonderdeel", "divisie", "werkmaatschappij"] },
  { key: "location", label: "Locatie", hints: ["locatie", "vestiging", "inrichting", "terrein"] },
  { key: "owner", label: "Eigenaar", hints: ["eigenaar", "verantwoordelijk", "verantwoordelijke", "owner", "contactpersoon"] },
  { key: "status", label: "Compliancestatus", preview: "legalStatus", hints: ["status", "voldoet", "compliance", "naleving", "compliancestatus", "voldaan"] },
  { key: "explanation", label: "Toelichting", hints: ["toelichting", "opmerking", "opmerkingen", "onderbouwing", "maatregel", "maatregelen", "bewijs"] },
  {
    key: "lastReviewDate",
    label: "Datum laatste toetsing",
    kind: "date",
    hints: ["laatste toetsing", "datum toetsing", "getoetst", "beoordeeld", "datum laatste", "laatst getoetst"],
  },
  {
    key: "nextReviewDate",
    label: "Volgende toetsing",
    kind: "date",
    hints: ["volgende toetsing", "volgende", "herbeoordeling", "hertoetsing", "volgende beoordeling", "toetsen voor"],
  },
];

/** Compliancestatus uit vrije tekst; `null` = niet herkend. Lege cel = nog niet getoetst. */
export function parseStatus(value: unknown): ComplianceStatus | null {
  const v = norm(String(value ?? ""));
  if (!v) return "NOT_ASSESSED";
  if (/^(n v t|nvt|niet van toepassing|na|n a|not applicable)$/.test(v)) return "NOT_APPLICABLE";
  if (/(voldoet niet|niet voldaan|non ?compliant|nee|^niet$|^nok$|^rood$|^red$|^no$)/.test(v)) return "NON_COMPLIANT";
  if (/(deels|gedeeltelijk|ten dele|partial|^oranje$|^geel$|^amber$|^orange$)/.test(v)) return "PARTIAL";
  if (/(voldoet|voldaan|^ja$|^ok$|^groen$|^green$|conform|compliant|^yes$|^v$|^x$)/.test(v)) return "COMPLIANT";
  if (/(niet getoetst|nog toetsen|onbekend|open|^\?$)/.test(v)) return "NOT_ASSESSED";
  return null;
}

/** Categorie op trefwoorden; onbekend → OTHER. */
export function parseCategory(value: unknown): LegalCategory {
  const v = norm(String(value ?? ""));
  if (/(milieu|omgeving|bodem|water|lucht|afval|geluid|natuur|emissie|bal\b|activiteitenbesluit)/.test(v)) return "ENVIRONMENT";
  if (/(arbo|veilig|gezondheid|vca|scl|asbest|brandveilig)/.test(v)) return "HEALTH_SAFETY";
  if (/(energie|co2|klimaat)/.test(v)) return "ENERGY_CO2";
  if (/(product|brl|bouwstof|kwaliteit|ce markering)/.test(v)) return "PRODUCT";
  if (/(bouw|bbl|bouwbesluit)/.test(v)) return "BUILDING";
  return "OTHER";
}
