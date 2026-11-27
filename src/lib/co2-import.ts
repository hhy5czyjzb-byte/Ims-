import type { ImportField } from "@/lib/spreadsheet-import";

/** Import van energieverbruik (CO2-prestatieladder): velden. Herkenning en validatie staan in de server-actie. */
export const CO2_IMPORT_FIELDS: ImportField[] = [
  { key: "externalRef", label: "Kenmerk / regelnummer", hints: ["nr", "nummer", "kenmerk", "id", "regel", "factuurregel", "ref"] },
  {
    key: "carrier",
    label: "Energiedrager / brandstof",
    required: true,
    hints: ["energiedrager", "brandstof", "energiebron", "bron", "soort", "type energie", "emissiebron", "product"],
  },
  {
    key: "quantity",
    label: "Hoeveelheid",
    required: true,
    kind: "decimal",
    preview: "decimal",
    hints: ["hoeveelheid", "verbruik", "aantal", "liters", "kwh", "m3", "volume", "totaal"],
  },
  { key: "unit", label: "Eenheid (controle)", hints: ["eenheid", "unit", "maat"] },
  {
    key: "period",
    label: "Periode (maand, kwartaal, halfjaar of jaar)",
    kind: "period",
    preview: "period",
    hints: ["periode", "maand", "kwartaal", "jaar", "maand jaar"],
  },
  { key: "periodStart", label: "Van (begindatum)", kind: "period", hints: ["van", "begindatum", "startdatum", "datum van", "vanaf", "datum"] },
  { key: "periodEnd", label: "Tot en met (einddatum)", kind: "period", hints: ["tot", "einddatum", "t m", "datum tot", "tot en met"] },
  { key: "discipline", label: "Discipline", hints: ["discipline", "afdeling", "bedrijfsonderdeel", "divisie"] },
  { key: "location", label: "Locatie", hints: ["locatie", "vestiging", "terrein"] },
  { key: "equipment", label: "Materieel (naam of kenteken)", hints: ["materieel", "machine", "voertuig", "kenteken", "machinenummer", "installatie"] },
  { key: "scope", label: "Scope (afwijkend)", hints: ["scope"] },
  { key: "description", label: "Omschrijving / factuur", hints: ["omschrijving", "factuur", "leverancier", "opmerking", "toelichting"] },
];
