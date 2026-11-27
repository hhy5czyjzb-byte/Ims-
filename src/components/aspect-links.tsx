import Link from "next/link";
import { Badge } from "@/components/ui";
import { aspectCode } from "@/lib/aspects";

type Item = { id: string; number: number; activity: string; aspect: string; significant: boolean };

/** Lijst van gekoppelde milieuaspecten (voor processen, wet- en regelgeving, risico's, normeisen). */
export function AspectLinkItems({ items }: { items: Item[] }) {
  return items.map((a) => (
    <li key={a.id} className="flex flex-wrap items-center gap-2">
      <Link href={`/milieuaspecten/${a.id}`}>
        {aspectCode(a.number)} {a.activity} — {a.aspect}
      </Link>
      {a.significant && <Badge className="bg-brand-red text-white">Significant</Badge>}
    </li>
  ));
}

export const aspectLinkSelect = { id: true, number: true, activity: true, aspect: true, significant: true } as const;
