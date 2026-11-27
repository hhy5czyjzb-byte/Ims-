import type { AspectType, OperatingSituation } from "@prisma/client";
import { normText, type ImportField } from "@/lib/spreadsheet-import";

/** Import van het milieuaspectenregister: velden en herkenning van situatie en aspecttype. */
export const ASPECT_IMPORT_FIELDS: ImportField[] = [
  { key: "externalRef", label: "Kenmerk / nr. in bronregister", hints: ["nr", "nummer", "kenmerk", "id", "code", "ref", "volgnummer"] },
  {
    key: "activity",
    label: "Activiteit",
    required: true,
    hints: ["activiteit", "activiteiten", "werkzaamheid", "werkzaamheden", "proces", "processtap", "bron"],
  },
  { key: "aspect", label: "Milieuaspect", required: true, hints: ["aspect", "milieuaspect", "milieuaspecten", "omschrijving aspect"] },
  { key: "aspectType", label: "Type aspect", preview: "aspectType", hints: ["type", "soort", "categorie", "compartiment", "milieucompartiment", "thema"] },
  { key: "impact", label: "Milieueffect", hints: ["effect", "milieueffect", "milieueffecten", "gevolg", "impact", "milieu impact"] },
  {
    key: "situation",
    label: "Situatie (normaal / abnormaal / nood)",
    preview: "aspectSituation",
    hints: ["situatie", "omstandigheid", "toestand", "n a e", "nae", "bedrijfssituatie"],
  },
  { key: "discipline", label: "Discipline", hints: ["discipline", "afdeling", "bedrijfsonderdeel", "divisie"] },
  { key: "location", label: "Locatie", hints: ["locatie", "vestiging", "inrichting", "terrein"] },
  { key: "owner", label: "Eigenaar", hints: ["eigenaar", "verantwoordelijk", "verantwoordelijke", "owner", "contactpersoon"] },
  { key: "controls", label: "Beheersmaatregelen", hints: ["beheersmaatregel", "beheersmaatregelen", "maatregel", "maatregelen", "beheersing"] },
  { key: "frequency", label: "Frequentie / kans (1–5)", kind: "int", hints: ["frequentie", "kans", "f", "waarschijnlijkheid", "vaak"] },
  { key: "severity", label: "Ernst (1–5)", kind: "int", hints: ["ernst", "e", "effectgrootte", "zwaarte"] },
  { key: "extent", label: "Omvang (1–5)", kind: "int", hints: ["omvang", "o", "schaal", "bereik", "hoeveelheid"] },
  { key: "score", label: "Score (uit eigen register)", kind: "int", hints: ["score", "totaal", "totaalscore", "risicoscore", "prioriteit"] },
  {
    key: "significant",
    label: "Significant (ja/nee)",
    preview: "yesNo",
    hints: ["significant", "significantie", "belangrijk", "significant aspect", "belangrijk aspect"],
  },
  {
    key: "legalApplies",
    label: "Bindende verplichting (ja/nee)",
    preview: "yesNo",
    hints: ["wetgeving", "wettelijke eis", "bindende verplichting", "wet", "vergunning"],
  },
  {
    key: "stakeholderConcern",
    label: "Zorgen belanghebbenden (ja/nee)",
    preview: "yesNo",
    hints: ["belanghebbenden", "stakeholders", "klachten", "omgeving zorgen"],
  },
  { key: "co2Relevant", label: "Relevant voor CO2 (ja/nee)", preview: "yesNo", hints: ["co2", "co2 relevant", "energie emissie", "klimaat"] },
  { key: "reviewDate", label: "Volgende beoordeling", kind: "date", hints: ["volgende beoordeling", "herbeoordeling", "beoordelen voor", "volgende toetsing"] },
];

/** Normale / abnormale / noodsituatie uit vrije tekst; leeg = normaal; `null` = niet herkend. */
export function parseSituation(value: unknown): OperatingSituation | null {
  const raw = String(value ?? "").trim();
  if (!raw) return "NORMAL";
  const v = normText(raw);
  if (!v) return null; // bijv. "?" of "-": niet herkend
  if (/^(n|normaal|normal|regulier|standaard)$/.test(v) || v.startsWith("normaal")) return "NORMAL";
  if (/^(a|abnormaal|abnormal|afwijkend)$/.test(v) || /(abnormaal|afwijk|onderhoud|storing|opstart|stilstand)/.test(v)) return "ABNORMAL";
  if (/^(e|nood|noodsituatie|calamiteit|emergency)$/.test(v) || /(nood|calamit|incident|brand)/.test(v)) return "EMERGENCY";
  return null;
}

/** Type aspect op trefwoorden (eerst het typeveld, anders de omschrijving). Afvalwater gaat vóór afval. */
export function parseAspectType(...values: unknown[]): AspectType {
  for (const value of values) {
    const v = normText(String(value ?? ""));
    if (!v) continue;
    if (/(afvalwater|riool|lozing|water|hemelwater|grondwater)/.test(v)) return "WATER";
    if (/(geluid|lawaai|noise)/.test(v)) return "NOISE";
    if (/(stof|lucht|emissie|uitstoot|rook|fijnstof|nox|uitlaatgas)/.test(v)) return "AIR";
    if (/(bodem|grond verontrein|lekkage|morsen)/.test(v)) return "SOIL";
    if (/(energie|elektriciteit|stroom|brandstof|diesel|gas|warmte)/.test(v)) return "ENERGY";
    if (/(afval|reststof)/.test(v)) return "WASTE";
    if (/(grondstof|materiaal|cement|zand|grind|toeslag|hulpstof)/.test(v)) return "RESOURCES";
    if (/(geur|stank)/.test(v)) return "ODOUR";
    if (/(trilling|vibratie)/.test(v)) return "VIBRATION";
    if (/(licht|verlichting)/.test(v)) return "LIGHT";
    if (/(transport|verkeer|vervoer|logistiek|vrachtwagen)/.test(v)) return "TRANSPORT";
  }
  return "OTHER";
}
