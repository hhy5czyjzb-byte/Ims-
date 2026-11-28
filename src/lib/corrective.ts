import type { ActionKind, FindingClass } from "@prisma/client";

/**
 * Correctie vs. corrigerende maatregel (ISO 9001/14001 §10.2):
 * - correctie = het directe probleem oplossen (symptoom);
 * - corrigerende maatregel = de oorzaak wegnemen zodat het niet terugkomt → oorzaakanalyse (root cause) verplicht.
 * Voor taken en verbeteringen is een oorzaak niet nodig.
 */
export const requiresRootCause = (kind: ActionKind) => kind === "CORRECTIVE";

/** Controle bij opslaan van een actie; geeft een foutmelding of null. */
export function rootCauseProblem(kind: ActionKind, rootCause: string | null | undefined): string | null {
  if (requiresRootCause(kind) && !rootCause?.trim())
    return "Leg bij een corrigerende maatregel de oorzaak (root cause) vast: welke oorzaak neemt deze maatregel weg?";
  return null;
}

/**
 * Redenen waarom een auditbevinding nog niet kan worden afgehandeld (leeg = mag).
 * Major/minor: oorzaakanalyse én minstens één corrigerende maatregel; alle acties gereed of vervallen.
 */
export function findingCloseProblems(f: { classification: FindingClass; rootCause: string | null; actions: { status: string; kind: ActionKind }[] }): string[] {
  const problems: string[] = [];
  const open = f.actions.filter((a) => a.status === "OPEN" || a.status === "IN_PROGRESS").length;
  if (open) problems.push(`Er staan nog ${open} actie(s) open; rond die eerst af (of zet ze op 'Vervallen').`);
  if (f.classification !== "OBSERVATION") {
    if (!f.rootCause?.trim()) problems.push("Leg eerst de oorzaakanalyse vast; die is verplicht bij een major of minor.");
    if (!f.actions.some((a) => a.kind === "CORRECTIVE" && a.status !== "CANCELLED"))
      problems.push("Voeg een corrigerende maatregel toe die de oorzaak wegneemt (een correctie alleen is niet genoeg bij een major of minor).");
  }
  return problems;
}
