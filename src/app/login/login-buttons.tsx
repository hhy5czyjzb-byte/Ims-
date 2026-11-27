"use client";

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
