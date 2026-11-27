"use client";

import { createContext, useContext, useState, useTransition, type FormEvent, type ReactNode } from "react";
import type { ActionResult } from "@/lib/action-result";

const PendingContext = createContext(false);

/** True terwijl het omliggende <Form> bezig is met opslaan. */
export function useFormPending() {
  return useContext(PendingContext);
}

/**
 * Formulier voor een server-actie dat foutmeldingen bovenaan toont.
 * Gebruik in plaats van <form action={...}>.
 *
 * Bewust via onSubmit i.p.v. de action-prop: React 19 wist een formulier na
 * elke action-verzending, ook bij een foutmelding — dan is de invoer weg.
 * Hier blijft de invoer staan bij een fout en wordt alleen bij succes gereset.
 */
export function Form({ action, children, className }: { action: (formData: FormData) => Promise<ActionResult>; children: ReactNode; className?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await action(formData);
      if (result?.error) {
        setError(result.error);
      } else {
        setError(null);
        form.reset();
      }
    });
  }

  return (
    <PendingContext.Provider value={pending}>
      <form onSubmit={onSubmit} className={className} aria-busy={pending}>
        {error && (
          <div role="alert" className="col-span-full mb-1 rounded-md border border-brand-red/30 bg-red-50 px-3 py-2 text-sm text-brand-red-dark">
            {error}
          </div>
        )}
        {children}
      </form>
    </PendingContext.Provider>
  );
}
