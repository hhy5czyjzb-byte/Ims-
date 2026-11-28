import type { ImportField } from "@/lib/spreadsheet-import";

/** Import van vestigingen (tabblad "Vestigingen" in het register wet- en regelgeving). */
export const LOCATION_IMPORT_FIELDS: ImportField[] = [
  { key: "name", label: "Vestiging (naam)", required: true, hints: ["vestiging", "locatie", "naam"] },
  { key: "address", label: "Adres", hints: ["adres", "straat"] },
  { key: "postalCode", label: "Postcode", hints: ["postcode"] },
  { key: "kind", label: "Soort", hints: ["soort", "type locatie", "type"] },
  { key: "managerText", label: "Vestigingsmanager / contactpersoon", hints: ["vestigingsmanager", "manager", "contactpersoon", "verantwoordelijke"] },
  { key: "permitInfo", label: "Vergunningen en meldingen", hints: ["vergunning", "omgevingsvergunning", "meldingen"] },
  { key: "notes", label: "Opmerkingen", hints: ["opmerkingen", "opmerking", "toelichting"] },
  { key: "city", label: "Plaats / gemeente", hints: ["plaats gemeente", "plaats", "gemeente", "woonplaats"] },
  { key: "activities", label: "Activiteiten", hints: ["activiteiten", "activiteiten invullen", "activiteit"] },
  {
    key: "energySavingObligation",
    label: "Boven drempel energiebesparingsplicht",
    hints: ["boven drempel energiebesparingsplicht", "energiebesparingsplicht", "energiebesparing"],
  },
];
