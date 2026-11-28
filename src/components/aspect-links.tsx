import Link from "next/link";
import { Badge } from "@/components/ui";
import { aspectDisplayCode } from "@/lib/aspects";

type Item = {
  id: string;
  number: number;
  externalRef: string | null;
  activity: string;
  aspect: string;
  businessUnit: string | null;
  locationText: string | null;
  significant: boolean;
};

/**
 * Lijst van gekoppelde milieuaspecten (voor processen, wet- en regelgeving, risico's, normeisen).
 * Significante aspecten eerst; bij veel koppelingen een link naar het gefilterde register.
 */
export function AspectLinkItems({ items, moreHref, max = 12 }: { items: Item[]; moreHref?: string; max?: number }) {
  const sorted = [...items].sort((a, b) => Number(b.significant) - Number(a.significant));
  const shown = sorted.slice(0, max);
  return (
    <>
      {shown.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-2">
          <Link href={`/milieuaspecten/${a.id}`}>
            {aspectDisplayCode(a)} {a.aspect}
          </Link>
          <span className="text-xs text-neutral-500">{[a.businessUnit, a.locationText].filter(Boolean).join(" · ") || a.activity}</span>
          {a.significant && <Badge className="bg-brand-red text-white">Significant</Badge>}
        </li>
      ))}
      {sorted.length > max && (
        <li className="text-xs text-neutral-500">
          En nog {sorted.length - max}.{" "}
          {moreHref && (
            <Link href={moreHref} className="text-xs">
              Alle {sorted.length} bekijken
            </Link>
          )}
        </li>
      )}
    </>
  );
}

export const aspectLinkSelect = {
  id: true,
  number: true,
  externalRef: true,
  activity: true,
  aspect: true,
  businessUnit: true,
  locationText: true,
  significant: true,
} as const;
