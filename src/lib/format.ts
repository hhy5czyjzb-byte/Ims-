const dateFmt = new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Amsterdam" });
const dateTimeFmt = new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Amsterdam" });

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return dateFmt.format(typeof d === "string" ? new Date(d) : d);
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return dateTimeFmt.format(typeof d === "string" ? new Date(d) : d);
}

/** Waarde voor <input type="date">. */
export function toDateInput(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export function isOverdue(deadline: Date | null | undefined, now = new Date()): boolean {
  if (!deadline) return false;
  const end = new Date(deadline);
  end.setHours(23, 59, 59, 999);
  return end < now;
}

export function daysUntil(d: Date, now = new Date()): number {
  return Math.ceil((d.getTime() - now.getTime()) / 86_400_000);
}
