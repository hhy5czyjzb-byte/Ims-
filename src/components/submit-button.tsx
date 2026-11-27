"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function SubmitButton({
  children,
  variant = "primary",
  confirm,
  className,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "link";
  confirm?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const cls = variant === "primary" ? "btn" : variant === "secondary" ? "btn-secondary" : "btn-link";
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${cls} ${className ?? ""}`}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? "Bezig…" : children}
    </button>
  );
}
