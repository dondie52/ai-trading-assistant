#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing .env. Copy .env.example and set DATABASE_URL first."
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set in .env"
  exit 1
fi

echo "Generating Prisma client..."
npm run prisma:generate -w @trading/api

echo "Deploying migrations to Supabase..."
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma

echo "Migration status:"
npx prisma migrate status --schema apps/api/prisma/schema.prisma

echo "Done."
