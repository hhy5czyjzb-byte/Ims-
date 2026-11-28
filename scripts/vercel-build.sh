#!/usr/bin/env bash
# Build op Vercel: controleren of de instellingen er zijn, database bijwerken (migraties + basisvulling), app bouwen.
# Migraties via de directe verbinding (Neon: DATABASE_URL_UNPOOLED); de app gebruikt de gepoolde DATABASE_URL.
set -eo pipefail

fout() {
  echo ""
  echo "=================================================================="
  echo "  IMS: $1"
  echo "=================================================================="
  echo ""
  exit 1
}

[ -n "${DATABASE_URL:-}" ] || fout "Er is nog geen database gekoppeld. Ga naar Storage > Create Database > Neon (regio Frankfurt) > Connect, en klik daarna op Redeploy."
[ -n "${NEXTAUTH_SECRET:-}" ] || fout "NEXTAUTH_SECRET ontbreekt (Settings > Environment Variables): vul minimaal 32 willekeurige tekens in."
if [ "${AUTH_MODE:-}" = "password" ]; then
  [ -n "${ADMIN_EMAIL:-}" ] || fout "ADMIN_EMAIL ontbreekt (Settings > Environment Variables)."
  [ "${#ADMIN_PASSWORD}" -ge 12 ] || fout "ADMIN_PASSWORD ontbreekt of is korter dan 12 tekens (Settings > Environment Variables)."
elif [ "${AUTH_MODE:-}" != "entra" ]; then
  fout "AUTH_MODE moet 'password' (tijdelijke login) of 'entra' (Microsoft 365) zijn (Settings > Environment Variables)."
fi

DIRECT_URL="${DATABASE_URL_UNPOOLED:-${POSTGRES_URL_NON_POOLING:-$DATABASE_URL}}"
echo "IMS: database bijwerken (migraties)…"
DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy || fout "De database kon niet worden bijgewerkt. Controleer of de Neon-database aan dit project is gekoppeld."
echo "IMS: basisgegevens (normen, disciplines)…"
DATABASE_URL="$DIRECT_URL" npx prisma db seed || fout "De basisgegevens konden niet worden geladen."
echo "IMS: app bouwen…"
npx next build
