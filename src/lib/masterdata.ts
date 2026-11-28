/** Bedrijfsonderdelen opzoeken op naam én op alternatieve schrijfwijzen (Stamgegevens → Bedrijfsonderdelen → andere namen). */
export function disciplineMap(disciplines: { id: string; name: string; aliases?: string[] }[]): Map<string, string> {
  const key = (s: string) => s.trim().toLowerCase();
  const map = new Map<string, string>();
  for (const d of disciplines) for (const a of d.aliases ?? []) if (a.trim()) map.set(key(a), d.id);
  for (const d of disciplines) map.set(key(d.name), d.id); // de eigen naam gaat altijd voor
  return map;
}

/** Komma- of puntkommagescheiden tekst naar een lijst zonder lege of dubbele waarden. */
export function splitList(value: string | null | undefined): string[] {
  return [
    ...new Set(
      String(value ?? "")
        .split(/[;,\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}
