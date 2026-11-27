/** CSV-veld voor Excel (NL): puntkomma als scheidingsteken, aanhalingstekens verdubbeld, geen formule-injectie. */
export function csvField(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Volledig CSV-bestand met BOM (zodat Excel UTF-8 herkent). */
export function toCsv(rows: unknown[][]): string {
  return "﻿" + rows.map((r) => r.map(csvField).join(";")).join("\r\n");
}

export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
