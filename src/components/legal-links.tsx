import Link from "next/link";
import type { ComplianceStatus } from "@prisma/client";
import { Badge } from "@/components/ui";
import { legalCode } from "@/lib/compliance";
import { COMPLIANCE_STATUS_CLASS, COMPLIANCE_STATUS_LABEL } from "@/lib/labels";

type Item = { id: string; number: number; title: string; article: string | null; status: ComplianceStatus };

/** Lijst van gekoppelde wettelijke eisen met compliancestatus (voor processen, documenten, risico's, normeisen). */
export function LegalLinkItems({ items }: { items: Item[] }) {
  return items.map((l) => (
    <li key={l.id} className="flex flex-wrap items-center gap-2">
      <Link href={`/wetgeving/${l.id}`}>
        {legalCode(l.number)} {l.title}
        {l.article ? ` — ${l.article}` : ""}
      </Link>
      <Badge className={COMPLIANCE_STATUS_CLASS[l.status]}>{COMPLIANCE_STATUS_LABEL[l.status]}</Badge>
    </li>
  ));
}

export const legalLinkSelect = { id: true, number: true, title: true, article: true, status: true } as const;
