"use client";

import { useState } from "react";

type Carrier = { id: string; name: string; unit: string; defaultScope: number };
type Equip = { id: string; label: string; defaultCarrierId: string | null };
type Opt = { value: string; label: string };
type Defaults = {
  carrierId?: string;
  quantity?: string;
  periodStart?: string;
  periodEnd?: string;
  scope?: number | null;
  description?: string | null;
  disciplineId?: string | null;
  locationId?: string | null;
  equipmentId?: string | null;
};

/** Invoervelden voor een verbruiksregel. Periode: een maand, of een eigen periode (bijv. factuurperiode). */
export function ConsumptionFields({
  carriers,
  equipment,
  disciplines,
  locations,
  defaults,
}: {
  carriers: Carrier[];
  equipment: Equip[];
  disciplines: Opt[];
  locations: Opt[];
  defaults?: Defaults;
}) {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const isMonth =
    !defaults?.periodStart ||
    (defaults.periodStart.endsWith("-01") &&
      defaults.periodEnd === new Date(Date.UTC(+defaults.periodStart.slice(0, 4), +defaults.periodStart.slice(5, 7), 0)).toISOString().slice(0, 10));
  const [carrierId, setCarrierId] = useState(defaults?.carrierId ?? "");
  const [equipmentId, setEquipmentId] = useState(defaults?.equipmentId ?? "");
  const [periodType, setPeriodType] = useState<"maand" | "anders">(isMonth ? "maand" : "anders");
  const carrier = carriers.find((c) => c.id === carrierId);

  return (
    <>
      <label className="block md:col-span-2">
        <span className="label">Energiedrager</span>
        <select name="carrierId" required value={carrierId} onChange={(e) => setCarrierId(e.target.value)} className="input">
          <option value="">— Kies —</option>
          {carriers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.unit})
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">Hoeveelheid{carrier ? ` (${carrier.unit})` : ""}</span>
        <input name="quantity" required inputMode="decimal" defaultValue={defaults?.quantity ?? ""} className="input" placeholder="bijv. 1.250,5" />
      </label>
      <label className="block">
        <span className="label">Scope</span>
        <select name="scope" defaultValue={defaults?.scope ? String(defaults.scope) : ""} className="input">
          <option value="">{carrier ? `Standaard (scope ${carrier.defaultScope})` : "Standaard van de energiedrager"}</option>
          <option value="1">Scope 1</option>
          <option value="2">Scope 2</option>
          <option value="3">Zakelijk reizen</option>
        </select>
      </label>

      <fieldset className="md:col-span-4">
        <legend className="label">Periode</legend>
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="radio" name="periodType" value="maand" checked={periodType === "maand"} onChange={() => setPeriodType("maand")} /> Maand
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="periodType" value="anders" checked={periodType === "anders"} onChange={() => setPeriodType("anders")} /> Eigen periode
          </label>
          {periodType === "maand" ? (
            <input
              name="month"
              type="month"
              required
              defaultValue={defaults?.periodStart?.slice(0, 7) ?? thisMonth}
              className="input w-44"
              aria-label="Maand"
            />
          ) : (
            <>
              <label>
                <span className="mb-1 block text-xs text-neutral-600">Van</span>
                <input name="periodStart" type="date" required defaultValue={defaults?.periodStart ?? ""} className="input" />
              </label>
              <label>
                <span className="mb-1 block text-xs text-neutral-600">Tot en met</span>
                <input name="periodEnd" type="date" required defaultValue={defaults?.periodEnd ?? ""} className="input" />
              </label>
            </>
          )}
        </div>
      </fieldset>

      <label className="block">
        <span className="label">Materieel (optioneel)</span>
        <select
          name="equipmentId"
          value={equipmentId}
          onChange={(e) => {
            setEquipmentId(e.target.value);
            const eq = equipment.find((x) => x.id === e.target.value);
            if (eq?.defaultCarrierId && !carrierId) setCarrierId(eq.defaultCarrierId);
          }}
          className="input"
        >
          <option value="">—</option>
          {equipment.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">Discipline</span>
        <select name="disciplineId" defaultValue={defaults?.disciplineId ?? ""} className="input">
          <option value="">Bedrijfsbreed</option>
          {disciplines.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">Locatie</span>
        <select name="locationId" defaultValue={defaults?.locationId ?? ""} className="input">
          <option value="">Alle locaties</option>
          {locations.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">Omschrijving / factuur</span>
        <input name="description" maxLength={1000} defaultValue={defaults?.description ?? ""} className="input" />
      </label>
    </>
  );
}
