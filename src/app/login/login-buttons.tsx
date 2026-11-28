"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export function MicrosoftLoginButton({ callbackUrl }: { callbackUrl: string }) {
  return (
    <button type="button" className="btn w-full py-2.5" onClick={() => signIn("azure-ad", { callbackUrl })}>
      <svg aria-hidden width="16" height="16" viewBox="0 0 21 21">
        <rect x="1" y="1" width="9" height="9" fill="#f25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
        <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
        <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
      </svg>
      Inloggen met Microsoft 365
    </button>
  );
}

/** Tijdelijke login met e-mail en wachtwoord (wachtwoordmodus, één beheerder). */
export function PasswordLoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const fd = new FormData(e.currentTarget);
        const r = await signIn("credentials", {
          email: String(fd.get("email") ?? ""),
          password: String(fd.get("password") ?? ""),
          redirect: false,
          callbackUrl,
        });
        setBusy(false);
        if (r?.ok && !r.error) window.location.href = callbackUrl;
        else setError("E-mailadres of wachtwoord onjuist. Na 10 mislukte pogingen kun je 15 minuten niet inloggen.");
      }}
    >
      {error && (
        <div role="alert" className="rounded-md border border-brand-red/30 bg-red-50 px-3 py-2 text-sm text-brand-red-dark">
          {error}
        </div>
      )}
      <label className="block">
        <span className="label">E-mailadres</span>
        <input name="email" type="email" required autoComplete="username" className="input" />
      </label>
      <label className="block">
        <span className="label">Wachtwoord</span>
        <input name="password" type="password" required autoComplete="current-password" className="input" />
      </label>
      <button type="submit" className="btn w-full py-2.5" disabled={busy}>
        {busy ? "Bezig…" : "Inloggen"}
      </button>
    </form>
  );
}
