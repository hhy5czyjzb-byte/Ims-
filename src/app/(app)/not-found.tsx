import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card max-w-xl">
      <h2>Niet gevonden</h2>
      <p className="mt-2 text-sm text-neutral-600">Dit item bestaat niet (meer).</p>
      <Link href="/" className="btn mt-4">
        Naar dashboard
      </Link>
    </div>
  );
}
