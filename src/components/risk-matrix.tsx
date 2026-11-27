import Link from "next/link";
import type { RiskType } from "@prisma/client";
import { IMPACT_LABEL, LIKELIHOOD_LABEL, RISK_SCALE, riskColor, riskTextColor } from "@/lib/risk";

type Cell = { likelihood: number; impact: number };

/**
 * 5×5-matrix: verticaal kans (5 boven), horizontaal effect.
 * - `counts` toont aantallen per cel (overzicht); met `href` wordt elke cel een filterlink.
 * - `markers` toont labels in cellen (bijv. "B" bruto en "N" na maatregelen op de detailpagina).
 */
export function RiskMatrix({
  type,
  counts,
  markers,
  href,
  selected,
  size = "md",
  title,
}: {
  type: RiskType;
  counts?: Record<string, number>;
  markers?: Record<string, string[]>;
  href?: (cell: Cell) => string;
  selected?: Cell | null;
  size?: "sm" | "md";
  title?: string;
}) {
  const cellSize = size === "sm" ? "h-9 w-9 text-xs" : "h-12 w-full min-w-10 text-sm";
  return (
    <figure className="w-full">
      {title && <figcaption className="mb-2 font-semibold">{title}</figcaption>}
      <div className="flex gap-2">
        <div className="flex items-center">
          <span className="-rotate-180 text-xs font-semibold tracking-wide text-neutral-500 uppercase [writing-mode:vertical-rl]">Kans</span>
        </div>
        <div className="flex-1">
          <table className="w-full border-separate border-spacing-1" aria-label={title ?? "Risicomatrix"}>
            <tbody>
              {[...RISK_SCALE].reverse().map((l) => (
                <tr key={l}>
                  <th scope="row" className="w-6 pr-1 text-right text-xs font-medium text-neutral-500" title={LIKELIHOOD_LABEL[l]}>
                    {l}
                  </th>
                  {RISK_SCALE.map((i) => {
                    const key = `${l}-${i}`;
                    const score = l * i;
                    const n = counts?.[key] ?? 0;
                    const mk = markers?.[key];
                    const isSel = selected?.likelihood === l && selected?.impact === i;
                    const content = (
                      <span
                        className={`flex ${cellSize} items-center justify-center rounded font-semibold tabular-nums transition ${isSel ? "ring-3 ring-neutral-900 ring-offset-1" : ""} ${
                          counts && n === 0 && !mk ? "opacity-35" : ""
                        }`}
                        style={{ backgroundColor: riskColor(score, type), color: riskTextColor(score, type) }}
                        title={`Kans ${l} (${LIKELIHOOD_LABEL[l]}) × effect ${i} (${IMPACT_LABEL[type][i]}) = ${score}${counts ? ` — ${n} item(s)` : ""}`}
                      >
                        {mk ? mk.join(" ") : counts ? n || "" : score}
                      </span>
                    );
                    return (
                      <td key={i} className="p-0">
                        {href && n > 0 ? (
                          <Link href={href({ likelihood: l, impact: i })} className="block no-underline hover:no-underline hover:brightness-95" scroll={false}>
                            {content}
                          </Link>
                        ) : (
                          content
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td />
                {RISK_SCALE.map((i) => (
                  <td key={i} className="pt-0.5 text-center text-xs font-medium text-neutral-500" title={IMPACT_LABEL[type][i]}>
                    {i}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          <div className="text-center text-xs font-semibold tracking-wide text-neutral-500 uppercase">Effect</div>
        </div>
      </div>
    </figure>
  );
}

/** Gekleurde scorebadge, bijv. "4×5 = 20". */
export function ScoreBadge({ likelihood, impact, type, muted }: { likelihood: number | null; impact: number | null; type: RiskType; muted?: boolean }) {
  if (likelihood == null || impact == null) return <span className="text-xs text-neutral-400">—</span>;
  const score = likelihood * impact;
  return (
    <span
      className={`badge font-semibold tabular-nums ${muted ? "opacity-60" : ""}`}
      style={{ backgroundColor: riskColor(score, type), color: riskTextColor(score, type) }}
      title={`Kans ${likelihood} × effect ${impact}`}
    >
      {score}
    </span>
  );
}
