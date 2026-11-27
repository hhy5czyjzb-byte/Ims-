"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // In productie verbergt Next.js de foutmelding van servercode; toon dan een algemene tekst.
  const message = error.message && !error.message.includes("Server Components render") ? error.message : "Er ging iets mis.";
  return (
    <div className="card max-w-xl border-brand-red/30">
      <h2 className="text-brand-red">Er ging iets mis</h2>
      <p className="mt-2 text-sm text-neutral-700">{message}</p>
      {error.digest && <p className="mt-1 text-xs text-neutral-400">Referentie: {error.digest}</p>}
      <div className="mt-4 flex gap-2">
        <button className="btn" onClick={() => reset()}>
          Opnieuw proberen
        </button>
        <button className="btn-secondary" onClick={() => history.back()}>
          Terug
        </button>
      </div>
    </div>
  );
}
