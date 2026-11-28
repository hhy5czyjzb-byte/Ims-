/**
 * Controle datakwaliteit van de CO2-emissie-inventaris (pure functies, getest). Bedoeld als voorbereiding op de
 * audit van de CO2-prestatieladder: ontbrekende factoren, verouderde factoren, ontbrekende of onvolledige
 * emissiestromen en opvallende verschillen met het vorige jaar die toegelicht moeten worden.
 */

export type CheckLine = {
  carrierId: string;
  name: string;
  unit: string;
  scope: 1 | 2 | 3;
  quantity: number;
  kg: number;
  missing: number;
  factorYear: number | null;
  coveredMonths: number;
};
export type CheckLevel = "error" | "warning" | "info";
export type Check = { level: CheckLevel; text: string; carrierId?: string };

const nf = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 });
const t1 = (kg: number) => `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(kg / 1000)} t`;

/**
 * @param months aantal maanden in de periode (12 voor een heel jaar, 6 voor een halfjaar, 3 voor een kwartaal)
 * @param changeThresholdPct verschil in hoeveelheid t.o.v. vorig jaar waarboven een toelichting wordt gevraagd
 * @param minKg verschillen onder deze uitstoot worden genegeerd (kleine stromen)
 */
export function inventoryChecks(input: {
  year: number;
  months: number;
  lines: CheckLine[];
  previous: CheckLine[] | null;
  fte: number | null;
  locationBasedConfigured: boolean;
  changeThresholdPct?: number;
  minKg?: number;
}): Check[] {
  const { year, months, lines, previous, fte, locationBasedConfigured } = input;
  const threshold = input.changeThresholdPct ?? 25;
  const minKg = input.minKg ?? 5000;
  const out: Check[] = [];
  const key = (l: CheckLine) => `${l.carrierId}|${l.scope}`;
  const prevBy = new Map((previous ?? []).map((l) => [key(l), l]));
  const curBy = new Map(lines.map((l) => [key(l), l]));

  for (const l of lines) {
    if (l.missing > 0)
      out.push({ level: "error", carrierId: l.carrierId, text: `${l.name}: geen emissiefactor voor ${year}; ${l.missing} verbruiksregel(s) tellen niet mee.` });
    else if (l.factorYear !== null && l.factorYear < year && l.kg !== 0)
      out.push({
        level: "warning",
        carrierId: l.carrierId,
        text: `${l.name}: emissiefactor van ${l.factorYear} gebruikt; controleer of er een factor voor ${year} is (CO2emissiefactoren.nl).`,
      });
    if (l.coveredMonths > 0 && l.coveredMonths < months)
      out.push({
        level: "warning",
        carrierId: l.carrierId,
        text: `${l.name}: verbruik in ${l.coveredMonths} van de ${months} maanden vastgelegd; ontbreekt er een periode?`,
      });
    const p = prevBy.get(key(l));
    if (p && p.quantity !== 0) {
      const pct = ((l.quantity - p.quantity) / Math.abs(p.quantity)) * 100;
      if (Math.abs(pct) >= threshold && Math.max(Math.abs(l.kg), Math.abs(p.kg)) >= minKg)
        out.push({
          level: "info",
          carrierId: l.carrierId,
          text: `${l.name}: ${pct > 0 ? "+" : ""}${nf.format(pct)} % t.o.v. ${year - 1} (${nf.format(p.quantity)} → ${nf.format(l.quantity)} ${l.unit}); leg de oorzaak vast voor de audit.`,
        });
    } else if (!p && previous && previous.length && Math.abs(l.kg) >= minKg)
      out.push({ level: "info", carrierId: l.carrierId, text: `${l.name}: nieuwe emissiestroom in ${year} (${t1(l.kg)}).` });
  }
  for (const p of previous ?? [])
    if (!curBy.has(key(p)) && Math.abs(p.kg) >= minKg)
      out.push({
        level: "warning",
        carrierId: p.carrierId,
        text: `${p.name}: geen verbruik vastgelegd in ${year}, wel in ${year - 1} (${t1(p.kg)}). Vergeten of gestopt?`,
      });
  if (lines.length && fte === null)
    out.push({ level: "info", text: `Geen FTE vastgelegd voor ${year}; de intensiteit (t CO2 per FTE) kan niet worden berekend.` });
  if (lines.some((l) => l.scope === 2) && !locationBasedConfigured)
    out.push({ level: "info", text: "Location-based scope 2 is niet ingesteld (kies de gridmix-factor bij Instellingen)." });
  const order: Record<CheckLevel, number> = { error: 0, warning: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
