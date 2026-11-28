import { createHash, timingSafeEqual } from "node:crypto";

/** Na zoveel mislukte pogingen binnen LOCK_MINUTES gaat het account tijdelijk op slot. */
export const MAX_FAILED_LOGINS = 10;
export const LOCK_MINUTES = 15;

const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();

/** Vergelijk e-mail en wachtwoord met de ingestelde beheerder, in constante tijd. */
export function checkAdminCredentials(input: { email?: unknown; password?: unknown }, admin: { email: string; password: string }, minLength: number): boolean {
  if (!admin.email || admin.password.length < minLength) return false;
  const email = String(input.email ?? "")
    .trim()
    .toLowerCase();
  const password = String(input.password ?? "");
  if (password.length > 1000) return false;
  const emailOk = timingSafeEqual(digest(email), digest(admin.email));
  const passwordOk = timingSafeEqual(digest(password), digest(admin.password));
  return emailOk && passwordOk;
}

export function isLockedOut(recentFailures: number): boolean {
  return recentFailures >= MAX_FAILED_LOGINS;
}
