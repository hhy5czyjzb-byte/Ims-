/** Centrale, getypeerde toegang tot configuratie. */
export const env = {
  isProduction: process.env.NODE_ENV === "production",
  azure: {
    tenantId: process.env.AZURE_AD_TENANT_ID ?? "",
    clientId: process.env.AZURE_AD_CLIENT_ID ?? "",
    clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? "",
  },
  groups: {
    qhse: process.env.ENTRA_GROUP_QHSE || undefined,
    directie: process.env.ENTRA_GROUP_DIRECTIE || undefined,
    middenkader: process.env.ENTRA_GROUP_MIDDENKADER || undefined,
  },
  sharePoint: {
    siteId: process.env.SHAREPOINT_SITE_ID ?? "",
    driveId: process.env.SHAREPOINT_DRIVE_ID ?? "",
  },
};

export const azureConfigured = !!(env.azure.tenantId && env.azure.clientId && env.azure.clientSecret);

/**
 * Inlogmodus:
 * - "local": geen inlogscherm; je werkt als de lokale gebruiker (fase 1, alleen via localhost).
 * - "password": tijdelijke login met één beheerder (e-mail + wachtwoord uit de instellingen), voor online
 *   zolang Microsoft 365 nog niet is gekoppeld. Rol QHSE.
 * - "entra": inloggen met Microsoft 365 (Entra ID); rechten uit Entra ID-groepen.
 * Zonder AUTH_MODE: "entra" als Microsoft 365 is ingesteld, anders "local".
 */
/** AUTH_MODE zonder spaties, aanhalingstekens of hoofdletters (veelvoorkomende typefouten in hosting-instellingen). */
const authModeSetting = (process.env.AUTH_MODE ?? "")
  .trim()
  .replace(/^["']|["']$/g, "")
  .trim()
  .toLowerCase();
export const authMode: "local" | "entra" | "password" =
  authModeSetting === "entra"
    ? "entra"
    : authModeSetting === "password"
      ? "password"
      : authModeSetting === "local"
        ? "local"
        : azureConfigured
          ? "entra"
          : "local";
export const localMode = authMode === "local";

/** Beheerder voor de wachtwoordmodus. Het wachtwoord staat alleen in de instellingen (Vercel / .env), nooit in de code. */
export const adminLogin = {
  email: (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase(),
  password: process.env.ADMIN_PASSWORD ?? "",
  name: process.env.ADMIN_NAME || "Eelco",
};
export const MIN_PASSWORD_LENGTH = 12;
export const passwordConfigured = adminLogin.email.includes("@") && adminLogin.password.length >= MIN_PASSWORD_LENGTH;

/** De gebruiker als wie je in de lokale modus werkt (rol QHSE). */
export const LOCAL_USER = { email: "lokaal@ims.local", name: process.env.LOCAL_USER_NAME || "Eelco" };

/** Is dit verzoek gericht aan deze computer zelf? (host-header zonder poort) */
export function isLocalHost(hostHeader: string | null): boolean {
  const host = (hostHeader ?? "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "")
    .replace(/^\[(.*)\]$/, "$1");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export const sharePointConfigured = !!env.sharePoint.driveId;
