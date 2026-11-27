import Image from "next/image";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { azureConfigured, devLoginEnabled } from "@/lib/env";
import { ROLE_LABEL } from "@/lib/labels";
import { brand } from "@/theme/brand";
import { DevLoginForm, MicrosoftLoginButton } from "./login-buttons";

export const metadata = { title: "Inloggen" };

const ERRORS: Record<string, string> = {
  tenant: "Alleen accounts van Rouwmaat Groep hebben toegang.",
  norole: "Je account is niet lid van een IMS-groep in Microsoft 365. Neem contact op met de KAM-afdeling.",
  AccessDenied: "Toegang geweigerd. Alleen leden van een IMS-groep in Microsoft 365 hebben toegang.",
  Callback: "Inloggen is mislukt. Probeer het opnieuw of neem contact op met de KAM-afdeling.",
  CredentialsSignin: "Ontwikkel-login mislukt.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; callbackUrl?: string }> }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) redirect("/");
  const { error, callbackUrl } = await searchParams;
  const safeCallback = callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/";

  const devUsers = devLoginEnabled
    ? await prisma.user.findMany({ where: { active: true }, orderBy: [{ role: "asc" }, { name: "asc" }], select: { id: true, name: true, role: true } })
    : [];

  return (
    <div className="flex min-h-screen flex-col">
      <div className="h-3 bg-brand-red" />
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="card p-8">
            <Image src={brand.logo.color} alt={brand.companyName} width={260} height={58} priority className="mx-auto h-auto w-[260px]" />
            <h1 className="mt-6 text-center text-xl">Integraal managementsysteem</h1>
            <p className="mt-1 text-center text-sm text-neutral-600">Log in met je Rouwmaat Microsoft 365-account.</p>

            {error && (
              <div role="alert" className="mt-4 rounded-md border border-brand-red/30 bg-red-50 px-3 py-2 text-sm text-brand-red-dark">
                {ERRORS[error] ?? "Inloggen is mislukt."}
              </div>
            )}

            <div className="mt-6">
              {azureConfigured ? (
                <MicrosoftLoginButton callbackUrl={safeCallback} />
              ) : (
                <p className="rounded-md bg-neutral-100 px-3 py-2 text-xs text-neutral-600">
                  Microsoft 365-login is nog niet geconfigureerd (AZURE_AD_* in .env). Zie README.
                </p>
              )}
            </div>

            {devLoginEnabled && (
              <div className="mt-6 border-t border-dashed border-neutral-300 pt-5">
                <div className="mb-2 text-xs font-semibold tracking-wide text-amber-700 uppercase">Ontwikkel-login (alleen lokaal)</div>
                <DevLoginForm users={devUsers.map((u) => ({ id: u.id, label: `${u.name} — ${ROLE_LABEL[u.role]}` }))} callbackUrl={safeCallback} />
              </div>
            )}
          </div>
          <p className="mt-4 text-center text-xs text-neutral-500">© {brand.companyName}</p>
        </div>
      </main>
      <div className="h-12 bg-brand-red-dark" />
    </div>
  );
}
