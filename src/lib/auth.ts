import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";
import type { JWT } from "next-auth/jwt";
import type { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { adminLogin, authMode, azureConfigured, env, localMode, MIN_PASSWORD_LENGTH, passwordConfigured } from "@/lib/env";
import { checkAdminCredentials, isLockedOut, LOCK_MINUTES } from "@/lib/password-login";
import { getLocalSessionUser } from "@/lib/local-user";
import { checkMemberGroups } from "@/lib/graph";
import { logAudit } from "@/lib/audit";
import { can, roleFromGroups, type Permission } from "@/lib/rbac";
import { UserError } from "@/lib/action-result";

/**
 * Gedelegeerde Graph-rechten:
 * - User.Read: profiel
 * - GroupMember.Read.All: groepslidmaatschap controleren (rol)
 * - Sites.Read.All: SharePoint-documentbibliotheek lezen (met de rechten van de gebruiker)
 */
const GRAPH_SCOPES = "openid profile email offline_access User.Read GroupMember.Read.All Sites.Read.All";

type EntraProfile = { oid?: string; tid?: string; email?: string; preferred_username?: string; name?: string; groups?: string[] };

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const res = await fetch(`https://login.microsoftonline.com/${env.azure.tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.azure.clientId,
        client_secret: env.azure.clientSecret,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken ?? "",
        scope: GRAPH_SCOPES,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw data;
    return {
      ...token,
      accessToken: data.access_token,
      accessTokenExpires: Date.now() + data.expires_in * 1000,
      refreshToken: data.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch (err) {
    console.error("[auth] token vernieuwen mislukt", err);
    return { ...token, error: "RefreshTokenError" };
  }
}

/** Rol uit Entra ID-groepen: groepsclaim in het token, anders via Graph. */
async function resolveEntraRole(profile: EntraProfile | undefined, accessToken: string | undefined): Promise<Role | null> {
  const groupIds = [env.groups.qhse, env.groups.directie, env.groups.middenkader].filter(Boolean) as string[];
  let groups = profile?.groups;
  if (!groups && accessToken) {
    // Groepsclaim ontbreekt (bijv. 'group overage'): vraag lidmaatschap op via Graph.
    groups = await checkMemberGroups(accessToken, groupIds).catch(() => []);
  }
  return roleFromGroups(groups, env.groups);
}

const providers: NextAuthOptions["providers"] = [];

if (azureConfigured) {
  providers.push(
    AzureADProvider({
      clientId: env.azure.clientId,
      clientSecret: env.azure.clientSecret,
      // Single-tenant: alleen accounts uit de Rouwmaat-tenant.
      tenantId: env.azure.tenantId,
      authorization: { params: { scope: GRAPH_SCOPES } },
    }),
  );
}

if (authMode === "password" && passwordConfigured) {
  providers.push(
    CredentialsProvider({
      id: "credentials",
      name: "E-mail en wachtwoord",
      credentials: { email: { label: "E-mail", type: "email" }, password: { label: "Wachtwoord", type: "password" } },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
          .trim()
          .toLowerCase()
          .slice(0, 200);
        // Slot na te veel mislukte pogingen (bijgehouden in het logboek, werkt ook met meerdere serverinstanties).
        const failures = await prisma.auditLog.count({
          where: { entityType: "LoginAttempt", userEmail: email, createdAt: { gte: new Date(Date.now() - LOCK_MINUTES * 60_000) } },
        });
        if (isLockedOut(failures)) return null;
        if (!checkAdminCredentials({ email, password: credentials?.password }, adminLogin, MIN_PASSWORD_LENGTH)) {
          await logAudit({ user: { email }, action: "LOGIN", entityType: "LoginAttempt", summary: "Inloggen mislukt (onjuist e-mailadres of wachtwoord)" });
          return null;
        }
        return { id: email, email, name: adminLogin.name };
      },
    }),
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 }, // werkdag
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "azure-ad") return true;
      const p = profile as EntraProfile | undefined;
      // Alleen Rouwmaat-accounts.
      if (!p?.tid || p.tid !== env.azure.tenantId) return "/login?error=tenant";
      // Alleen leden van een IMS-groep in Entra ID.
      const role = await resolveEntraRole(p, account.access_token);
      if (!role) return "/login?error=norole";
      return true;
    },

    async jwt({ token, account, profile, user }) {
      // Eerste login
      if (account && user) {
        let role: Role | null = null;
        let dbUserId: string;

        if (account.provider === "azure-ad") {
          const p = (profile ?? {}) as EntraProfile;
          role = await resolveEntraRole(p, account.access_token);
          if (!role) throw new Error("NoRole"); // wordt al in signIn afgevangen

          const email = (p.email ?? p.preferred_username ?? user.email ?? "").toLowerCase();
          const dbUser = await prisma.user.upsert({
            where: { entraObjectId: p.oid ?? user.id },
            update: { name: p.name ?? user.name ?? email, email, role, lastLoginAt: new Date(), active: true },
            create: { entraObjectId: p.oid ?? user.id, name: p.name ?? user.name ?? email, email, role, lastLoginAt: new Date() },
          });
          dbUserId = dbUser.id;
          token.accessToken = account.access_token;
          token.refreshToken = account.refresh_token;
          token.accessTokenExpires = account.expires_at ? account.expires_at * 1000 : Date.now() + 3600_000;
        } else if (account.provider === "credentials" && authMode === "password") {
          // Tijdelijke beheerderslogin (wachtwoordmodus): rol QHSE.
          role = "QHSE";
          const email = (user.email ?? "").toLowerCase();
          const dbUser = await prisma.user.upsert({
            where: { email },
            update: { name: user.name ?? email, role, lastLoginAt: new Date(), active: true },
            create: { name: user.name ?? email, email, role, lastLoginAt: new Date() },
          });
          dbUserId = dbUser.id;
        } else {
          throw new Error("Onbekende inlogmethode");
        }

        token.userId = dbUserId;
        token.role = role;
        await logAudit({
          user: { id: dbUserId, email: token.email },
          action: "LOGIN",
          entityType: "User",
          entityId: dbUserId,
          summary: `Ingelogd via ${account.provider}`,
        });
        return token;
      }

      // Graph-token vernieuwen indien verlopen
      if (token.refreshToken && token.accessTokenExpires && Date.now() > token.accessTokenExpires - 60_000) {
        return refreshAccessToken(token);
      }
      return token;
    },

    async session({ session, token }) {
      session.user = {
        id: token.userId ?? "",
        name: token.name ?? "",
        email: token.email ?? "",
        role: token.role ?? "MIDDENKADER",
      };
      if (token.error) session.error = token.error;
      return session;
    },
  },
};

export type SessionUser = { id: string; name: string; email: string; role: Role };

/** Huidige gebruiker in een servercomponent/-actie; stuurt door naar login als niet ingelogd. */
export async function requireUser(): Promise<SessionUser> {
  // Lokale modus (fase 1): geen inlog; de middleware staat alleen verzoeken via localhost toe.
  if (localMode) return getLocalSessionUser();
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.role) redirect("/login");
  return session.user;
}

/** Vereis een recht; anders een foutmelding (wordt door error.tsx getoond). */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) {
    throw new UserError("Je hebt geen rechten voor deze handeling.");
  }
  return user;
}

/**
 * Voor pagina's (niet voor server-acties): zonder recht naar een nette "geen toegang"-pagina
 * in plaats van een foutmelding (500).
 */
export async function requirePagePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect("/geen-toegang");
  return user;
}

/** Graph-token van de huidige gebruiker (server-side, verlaat de server nooit). */
export async function getGraphAccessToken(): Promise<string | null> {
  if (localMode) return null;
  const { cookies, headers } = await import("next/headers");
  const { getToken } = await import("next-auth/jwt");
  const cookieStore = await cookies();
  const headerStore = await headers();
  const token = await getToken({
    req: { cookies: Object.fromEntries(cookieStore.getAll().map((c) => [c.name, c.value])), headers: Object.fromEntries(headerStore.entries()) } as never,
    secret: process.env.NEXTAUTH_SECRET,
  });
  if (!token?.accessToken || token.error) return null;
  if (token.accessTokenExpires && Date.now() > token.accessTokenExpires) return null;
  return token.accessToken;
}
