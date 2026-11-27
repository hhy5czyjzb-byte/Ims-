"use client";

import { useMemo, useState } from "react";

type Group = { label: string; options: { value: string; label: string }[] };

/**
 * Doorzoekbare lijst met vinkjes voor het koppelen van veel items
 * (bijv. normeisen). Verstuurt geselecteerde waarden als `name` (meervoudig).
 */
export function CheckboxPicker({ name, groups, selected, height = "16rem" }: { name: string; groups: Group[]; selected: string[]; height?: string }) {
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set(selected));
  const [onlySelected, setOnlySelected] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        options: g.options.filter((o) => (!q || o.label.toLowerCase().includes(q)) && (!onlySelected || checked.has(o.value))),
      }))
      .filter((g) => g.options.length > 0);
  }, [groups, query, onlySelected, checked]);

  const toggle = (v: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });

  return (
    <div className="rounded-md border border-neutral-300 bg-white">
      <div className="flex items-center gap-2 border-b border-neutral-200 p-2">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoeken…" className="input py-1.5" aria-label="Zoeken" />
        <label className="flex shrink-0 items-center gap-1 text-xs text-neutral-600">
          <input type="checkbox" checked={onlySelected} onChange={(e) => setOnlySelected(e.target.checked)} /> Alleen gekozen ({checked.size})
        </label>
      </div>
      <div className="overflow-y-auto p-2 text-sm" style={{ maxHeight: height }}>
        {filtered.length === 0 && <div className="px-1 py-2 text-neutral-500">Niets gevonden.</div>}
        {filtered.map((g) => (
          <fieldset key={g.label} className="mb-2">
            {groups.length > 1 && <legend className="px-1 text-xs font-semibold tracking-wide text-neutral-500 uppercase">{g.label}</legend>}
            {g.options.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 hover:bg-neutral-50">
                <input type="checkbox" className="mt-0.5" checked={checked.has(o.value)} onChange={() => toggle(o.value)} />
                <span>{o.label}</span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      {/* Verborgen velden zodat ook weggefilterde selecties worden meegestuurd */}
      {[...checked].map((v) => (
        <input key={v} type="hidden" name={name} value={v} />
      ))}
    </div>
  );
}
