import type { ActionKind, ActionPriority, ActionSource, ActionStatus } from "@prisma/client";
import { normText, type ImportField } from "@/lib/spreadsheet-import";

export const ACTION_IMPORT_FIELDS: ImportField[] = [
  { key: "externalRef", label: "Nr. (eigen actielijst)", hints: ["nr", "nummer", "actienummer", "kenmerk", "id", "volgnummer"] },
  { key: "title", label: "Actie", required: true, hints: ["actie", "wat", "omschrijving actie", "maatregel", "taak", "actiepunt"] },
  { key: "description", label: "Toelichting", hints: ["toelichting", "omschrijving", "beschrijving", "details", "opmerking"] },
  { key: "source", label: "Bron / herkomst", hints: ["bron", "herkomst", "aanleiding", "afkomstig van"] },
  { key: "kind", label: "Soort (taak, correctie, corrigerend, verbetering)", hints: ["soort", "type", "soort actie"] },
  { key: "owner", label: "Eigenaar / actiehouder", hints: ["eigenaar", "actiehouder", "verantwoordelijk", "wie", "uitvoerder"] },
  { key: "deadline", label: "Deadline", kind: "date", hints: ["deadline", "termijn", "uiterlijk", "gereed voor", "streefdatum", "datum gereed"] },
  { key: "status", label: "Status", hints: ["status", "stand"] },
  { key: "priority", label: "Prioriteit", hints: ["prioriteit", "prio", "urgentie"] },
  { key: "discipline", label: "Bedrijfsonderdeel / BU", hints: ["bu", "bedrijfsonderdeel", "discipline", "afdeling"] },
  { key: "location", label: "Vestiging", hints: ["locatie", "vestiging"] },
  { key: "result", label: "Resultaat / evaluatie", hints: ["resultaat", "evaluatie", "uitkomst", "effectiviteit"] },
  { key: "completedAt", label: "Gereed op", kind: "date", hints: ["gereed op", "afgerond op", "datum afgerond", "datum gereed gemeld"] },
  { key: "reportRef", label: "Melding (nr.)", hints: ["melding", "meldingnummer", "nc nummer", "incident nr"] },
];

export function parseActionStatus(value: unknown): ActionStatus | null {
  const v = normText(String(value ?? ""));
  if (!v) return null;
  if (/(gereed|afgerond|klaar|done|gesloten|afgesloten|uitgevoerd|ok)/.test(v)) return "DONE";
  if (/(vervallen|geannuleerd|cancel|niet meer nodig)/.test(v)) return "CANCELLED";
  if (/(uitvoering|bezig|loopt|lopend|progress|gestart)/.test(v)) return "IN_PROGRESS";
  if (/(open|nieuw|gepland|todo|te doen)/.test(v)) return "OPEN";
  return null;
}

export function parseActionKind(value: unknown): ActionKind | null {
  const v = normText(String(value ?? ""));
  if (!v) return null;
  if (/(corrigerend|corrective|ca\b)/.test(v)) return "CORRECTIVE";
  if (/(correctie|direct|herstel)/.test(v)) return "CORRECTION";
  if (/(verbeter|preventie|preventief|improvement|kans)/.test(v)) return "IMPROVEMENT";
  if (/(taak|actie|task)/.test(v)) return "TASK";
  return null;
}

export function parseActionPriority(value: unknown): ActionPriority | null {
  const v = normText(String(value ?? ""));
  if (!v) return null;
  if (/^(h|hoog|high|1|urgent)/.test(v)) return "HIGH";
  if (/^(l|laag|low|3)/.test(v)) return "LOW";
  if (/^(m|middel|normaal|medium|gemiddeld|2)/.test(v)) return "MEDIUM";
  return null;
}

/** Bron uit vrije tekst; onbekend → handmatig. */
export function parseActionSource(value: unknown): ActionSource {
  const v = normText(String(value ?? ""));
  if (!v) return "MANUAL";
  if (/(klacht)/.test(v)) return "COMPLAINT";
  if (/(ongeval|incident|bijna|onveilig|lmra|vgm melding)/.test(v)) return "INCIDENT";
  if (/(afwijking|nc\b|non ?conform|tekortkoming)/.test(v)) return "NONCONFORMITY";
  if (/(audit|bevinding)/.test(v)) return "AUDIT";
  if (/(directie|managementreview|mr\b)/.test(v)) return "MANAGEMENT_REVIEW";
  if (/(co2|energie)/.test(v)) return "CO2_REDUCTION";
  if (/(milieuaspect|mar\b)/.test(v)) return "ENVIRONMENTAL_ASPECT";
  if (/(wet|regelgeving|compliance|vergunning)/.test(v)) return "COMPLIANCE";
  if (/(risico|kans|rie|ri e)/.test(v)) return "RISK";
  return "OTHER";
}
