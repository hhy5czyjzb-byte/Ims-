"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionResult } from "@/lib/action-result";

/**
 * Formulier voor een server-actie dat foutmeldingen bovenaan toont.
 * Gebruik in plaats van <form action={...}>.
 */
export function Form({ action, children, className }: { action: (formData: FormData) => Promise<ActionResult>; children: ReactNode; className?: string }) {
  const [state, formAction] = useActionState(async (_prev: ActionResult, formData: FormData) => (await action(formData)) ?? undefined, undefined);
  return (
    <form action={formAction} className={className}>
      {state?.error && (
        <div role="alert" className="col-span-full mb-1 rounded-md border border-brand-red/30 bg-red-50 px-3 py-2 text-sm text-brand-red-dark">
          {state.error}
        </div>
      )}
      {children}
    </form>
  );
}
