import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/labels";

export const metadata = { title: "Geen toegang" };

/** Doel van requirePagePermission: pagina waarvoor de rol geen rechten heeft. */
export default async function NoAccessPage() {
  const user = await requireUser();
  return (
    <div className="card max-w-xl">
      <h1 className="text-xl">Geen toegang</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Deze pagina is alleen voor QHSE. Je bent ingelogd als {user.name} ({ROLE_LABEL[user.role]}). Denk je dat je hier wel bij moet kunnen? Neem contact op
        met QHSE.
      </p>
      <p className="mt-4 text-sm">
        <Link href="/">Naar het dashboard</Link>
      </p>
    </div>
  );
}
