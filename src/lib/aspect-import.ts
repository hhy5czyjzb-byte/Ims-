import type { AspectPriority, AspectSiteType, OperatingSituation } from "@prisma/client";
import { normText, type ImportField } from "@/lib/spreadsheet-import";

/** Import van het milieuaspectenregister (MAR); kolomnamen zoals in het register van Rouwmaat. */
export const ASPECT_IMPORT_FIELDS: ImportField[] = [
  { key: "externalRef", label: "Nr. (bijv. A001)", hints: ["nr", "nummer", "kenmerk", "id", "code", "volgnummer"] },
  { key: "businessUnit", label: "Bedrijfsonderdeel", hints: ["bedrijfsonderdeel", "bu", "discipline", "afdeling", "divisie"] },
  { key: "location", label: "Locatie", hints: ["locatie", "vestiging", "inrichting", "terrein"] },
  { key: "siteType", label: "Type (vestiging / project / groep)", hints: ["type", "soort locatie"] },
  { key: "siteStatus", label: "Status locatie", hints: ["status locatie", "status"] },
  { key: "activity", label: "Activiteit", required: true, hints: ["activiteit", "activiteiten", "werkzaamheid", "werkzaamheden", "processtap"] },
  { key: "mba", label: "MBA (Bal)", hints: ["mba bal", "mba", "milieubelastende activiteit"] },
  { key: "theme", label: "Milieuthema", hints: ["milieuthema", "thema", "compartiment", "milieucompartiment"] },
  { key: "aspect", label: "Milieuaspect", required: true, hints: ["milieuaspect", "aspect", "milieuaspecten"] },
  { key: "impact", label: "Milieueffect", hints: ["milieueffect", "milieueffecten", "gevolg"] },
  { key: "contextFactor", label: "Contextfactor", hints: ["contextfactor", "context"] },
  { key: "legalApplies", label: "Wettelijke eis (ja/nee)", preview: "yesNo", hints: ["wettelijke eis", "bindende verplichting"] },
  { key: "legalText", label: "Wet- en regelgeving (tekst)", hints: ["wet en regelgeving", "wetgeving", "regelgeving"] },
  { key: "legalRefs", label: "Register nr. (W-nummers)", hints: ["register nr", "register nummer", "w nummer", "wetgevingsregister"] },
  { key: "riskRefs", label: "Risico- en kansenregister (R/K-nummers)", hints: ["risico en kansenregister", "risicoregister", "risico s en kansen"] },
  { key: "stakeholders", label: "Stakeholders", hints: ["stakeholders", "belanghebbenden"] },
  { key: "complaints", label: "Klachten (ja/nee)", preview: "yesNo", hints: ["klachten", "klacht"] },
  { key: "controls", label: "Voorzieningen / beheersmaatregelen", hints: ["voorzieningen", "beheersmaatregelen", "beheersmaatregel", "beheersing"] },
  { key: "effect", label: "Effect (E)", kind: "decimal", hints: ["effect", "e", "effect e"] },
  { key: "exposure", label: "Voorkomen (B)", kind: "decimal", hints: ["voorkomen", "b", "blootstelling", "voorkomen b"] },
  { key: "probability", label: "Waarschijnlijkheid (W)", kind: "decimal", hints: ["waarschijnlijkheid", "w", "waarschijnlijkheid w"] },
  { key: "opportunity", label: "Kans of bedreiging", preview: "opportunity", hints: ["kans of bedreiging", "kans bedreiging"] },
  { key: "priority", label: "Prio (H / M / L)", preview: "aspectPriority", hints: ["prio", "prioriteit"] },
  { key: "priorityRationale", label: "Onderbouwing prio", hints: ["onderbouwing prio", "onderbouwing"] },
  { key: "lcRawMaterials", label: "Levenscyclus: grondstofwinning", kind: "int", hints: ["grondstofwinning"] },
  { key: "lcDesign", label: "Levenscyclus: ontwerp", kind: "int", hints: ["ontwerp"] },
  { key: "lcProduction", label: "Levenscyclus: productie", kind: "int", hints: ["productie"] },
  { key: "lcTransport", label: "Levenscyclus: transport", kind: "int", hints: ["transport"] },
  { key: "lcUse", label: "Levenscyclus: gebruik", kind: "int", hints: ["gebruik"] },
  { key: "lcEndOfLife", label: "Levenscyclus: einde levensduur", kind: "int", hints: ["einde levensduur"] },
  { key: "lcDisposal", label: "Levenscyclus: definitieve verwijdering", kind: "int", hints: ["definitieve verwijdering"] },
  { key: "lifecycleSource", label: "Bron levenscyclus", hints: ["bron levenscyclus"] },
  { key: "measure", label: "Maatregel", hints: ["maatregel", "maatregelen", "doelstelling"] },
  { key: "owner", label: "Eigenaar", hints: ["eigenaar", "verantwoordelijk", "verantwoordelijke"] },
  { key: "origin", label: "Herkomst", hints: ["herkomst"] },
  { key: "situation", label: "Situatie (normaal / abnormaal / nood)", preview: "aspectSituation", hints: ["situatie", "n a e", "bedrijfssituatie"] },
  { key: "co2Relevant", label: "Relevant voor CO2 (ja/nee)", preview: "yesNo", hints: ["co2 relevant"] },
  { key: "reviewDate", label: "Volgende beoordeling", kind: "date", hints: ["volgende beoordeling", "herbeoordeling"] },
];

/** H / M / L of hoog / middel / laag; leeg = geen prio; `undefined` = niet herkend. */
export function parsePriority(value: unknown): AspectPriority | null | undefined {
  const v = normText(String(value ?? ""));
  if (!v) return null;
  if (/^(h|hoog|high)$/.test(v)) return "HIGH";
  if (/^(m|middel|midden|medium|gemiddeld)$/.test(v)) return "MEDIUM";
  if (/^(l|laag|low)$/.test(v)) return "LOW";
  return undefined;
}

/** "Kans" → true, "Bedreiging"/"Risico" → false; leeg → undefined. */
export function parseOpportunity(value: unknown): boolean | undefined {
  const v = normText(String(value ?? ""));
  if (!v) return undefined;
  if (/^(kans|kansen|opportunity|k)$/.test(v)) return true;
  if (/^(bedreiging|risico|threat|b|r)$/.test(v)) return false;
  return undefined;
}

/** Vestiging / project / groep. */
export function parseSiteType(value: unknown): AspectSiteType | undefined {
  const v = normText(String(value ?? ""));
  if (!v) return undefined;
  if (v.startsWith("project") || v.startsWith("werk")) return "PROJECT";
  if (v.startsWith("groep") || v.startsWith("alle")) return "GROUP";
  if (v.startsWith("vestiging") || v.startsWith("locatie")) return "SITE";
  return undefined;
}

/** "In werking" → true, "Tijdelijk niet in werking" / "buiten werking" → false. */
export function parseInOperation(value: unknown): boolean | undefined {
  const v = normText(String(value ?? ""));
  if (!v) return undefined;
  if (/(niet in werking|buiten werking|gesloten|stil)/.test(v)) return false;
  if (/(in werking|actief|open)/.test(v)) return true;
  return undefined;
}

/** Levenscyclusscore 1–3 (leeg = n.v.t.); `undefined` = ongeldig. */
export function parseLifecycle(value: unknown): number | null | undefined {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= 3 ? n : undefined;
}

/** "W001, W013" / "R01; K03" → genormaliseerde nummers. */
export function splitRefs(value: unknown): string[] {
  return [
    ...new Set(
      String(value ?? "")
        .split(/[,;/\n]+/)
        .map((s) => s.trim().toUpperCase())
        .filter((s) => /^[A-Z]{1,3}-?\d+$/.test(s)),
    ),
  ];
}

/** Normale / abnormale / noodsituatie uit vrije tekst; leeg = normaal; `null` = niet herkend. */
export function parseSituation(value: unknown): OperatingSituation | null {
  const raw = String(value ?? "").trim();
  if (!raw) return "NORMAL";
  const v = normText(raw);
  if (!v) return null;
  if (/^(n|normaal|normal|regulier|standaard)$/.test(v) || v.startsWith("normaal")) return "NORMAL";
  if (/^(a|abnormaal|abnormal|afwijkend)$/.test(v) || /(abnormaal|afwijk|onderhoud|storing|opstart|stilstand)/.test(v)) return "ABNORMAL";
  if (/^(e|nood|noodsituatie|calamiteit|emergency)$/.test(v) || /(nood|calamit|incident|brand)/.test(v)) return "EMERGENCY";
  return null;
}
