"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

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

export function DevLoginForm({ users, callbackUrl }: { users: { id: string; label: string }[]; callbackUrl: string }) {
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  if (!users.length) return <p className="text-xs text-neutral-500">Geen testgebruikers. Draai eerst: npm run db:seed</p>;
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        signIn("dev", { userId, callbackUrl });
      }}
    >
      <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="Testgebruiker">
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.label}
          </option>
        ))}
      </select>
      <button type="submit" className="btn-secondary whitespace-nowrap">
        Inloggen
      </button>
    </form>
  );
}
