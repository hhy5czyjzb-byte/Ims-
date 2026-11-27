import { Prisma } from "@prisma/client";
import { unstable_rethrow } from "next/navigation";

/** Fout met een melding die de gebruiker mag zien (validatie, rechten, bestaat al). */
export class UserError extends Error {}

export type ActionResult = { error?: string } | void;

/**
 * Wikkel een server-actie: redirects gaan door, gebruikersfouten worden als
 * melding teruggegeven aan het formulier (Next.js verbergt foutteksten in
 * productie), onverwachte fouten worden gelogd en algemeen gemeld.
 */
export async function safeAction(fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await fn();
  } catch (err) {
    unstable_rethrow(err); // redirect() / notFound()
    if (err instanceof UserError) return { error: err.message };
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") return { error: "Dit item bestaat al (dubbele naam of code)." };
      if (err.code === "P2025") return { error: "Dit item bestaat niet (meer). Ververs de pagina." };
    }
    console.error("[action] onverwachte fout", err);
    return { error: "Er ging iets mis bij het opslaan. Probeer het opnieuw." };
  }
}
