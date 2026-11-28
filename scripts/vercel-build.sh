#!/usr/bin/env bash
# Build op Vercel: database bijwerken (migraties + basisvulling) en daarna de app bouwen.
# Migraties via de directe verbinding (Neon: DATABASE_URL_UNPOOLED); de app gebruikt de gepoolde DATABASE_URL.
set -euo pipefail
DIRECT_URL="${DATABASE_URL_UNPOOLED:-${POSTGRES_URL_NON_POOLING:-$DATABASE_URL}}"
DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy
DATABASE_URL="$DIRECT_URL" npx prisma db seed
npx next build
