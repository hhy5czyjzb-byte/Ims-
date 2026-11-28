/**
 * Wijzigingen voor de audit trail: per veld de oude en de nieuwe waarde (als tekst), alleen velden die echt veranderen.
 * Wordt opgeslagen in `AuditLog.details.changes` en in de logboeken getoond als "oud → nieuw".
 */
export type FieldChange = { field: string; label: string; from: string; to: string };

export function auditValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && v !== null && "toNumber" in v && typeof (v as { toNumber: unknown }).toNumber === "function")
    return String((v as { toNumber: () => number }).toNumber());
  if (typeof v === "boolean") return v ? "ja" : "nee";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  return String(v);
}

export function diffFields(before: Record<string, unknown>, after: Record<string, unknown>, labels: Record<string, string>): FieldChange[] {
  const out: FieldChange[] = [];
  for (const [field, label] of Object.entries(labels)) {
    if (!(field in after)) continue;
    const from = auditValue(before[field]);
    const to = auditValue(after[field]);
    if (from !== to) out.push({ field, label, from, to });
  }
  return out;
}

/** Changes uit opgeslagen details (veilig, voor weergave). */
export function readChanges(details: unknown): FieldChange[] {
  if (!details || typeof details !== "object" || !("changes" in details)) return [];
  const c = (details as { changes: unknown }).changes;
  return Array.isArray(c) ? c.filter((x): x is FieldChange => !!x && typeof x === "object" && "label" in x && "from" in x && "to" in x) : [];
}
