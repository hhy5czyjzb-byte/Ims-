import { SMART_LETTERS, smartCheck, type SmartInput } from "@/lib/objectives";

/** S·M·A·R·T als vijf letters: groen = ingevuld, grijs = ontbreekt (met uitleg bij aanwijzen). */
export function SmartBadge({ o, showMissing }: { o: SmartInput; showMissing?: boolean }) {
  const check = smartCheck(o);
  return (
    <span className="inline-flex flex-col gap-1">
      <span
        className="inline-flex gap-0.5"
        title={check.ok ? "SMART" : `Nog niet SMART — ontbreekt: ${check.missing.join("; ")}`}
        aria-label={check.ok ? "SMART" : "Nog niet SMART"}
      >
        {SMART_LETTERS.map((l) => (
          <span
            key={l.key}
            className={`inline-flex size-5 items-center justify-center rounded text-[11px] font-bold ${check.letters[l.key] ? "bg-green-600 text-white" : "border border-dashed border-neutral-400 text-neutral-400"}`}
          >
            {l.key}
          </span>
        ))}
      </span>
      {showMissing && !check.ok && <span className="text-xs text-amber-800">Nog niet SMART — vul aan: {check.missing.join("; ")}.</span>}
    </span>
  );
}
