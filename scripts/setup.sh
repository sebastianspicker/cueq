#!/usr/bin/env bash
# Prepares a disposable local development environment: dependencies, PostgreSQL,
# Prisma generation, migrations/schema setup, and the documented synthetic baseline.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib.sh
source "${SCRIPT_DIR}/lib.sh"

export DATABASE_URL="${DATABASE_URL:-postgresql://cueq:cueq_dev_password@localhost:5433/cueq?schema=public}"
COMPOSE_CMD="$(docker_compose_cmd)"

echo "Installing dependencies from pnpm-lock.yaml..."
if [[ "${SKIP_INSTALL:-0}" == "1" ]]; then
  echo "Skipping dependency installation because SKIP_INSTALL=1."
else
  run_pnpm install --frozen-lockfile
fi

if [[ "${SKIP_DOCKER:-0}" != "1" ]]; then
  echo "Starting Docker services..."
  if ${COMPOSE_CMD} up -d; then
    echo "Waiting for PostgreSQL..."
    sleep 3
  else
    echo "Warning: Docker services could not be started. Continuing with the existing DATABASE_URL target."
  fi
fi

echo "Generating Prisma client..."
run_pnpm db:generate

echo "Applying migrations to database..."
if ! run_pnpm --filter @cueq/database db:migrate:deploy; then
  echo "Database migration failed. Local Docker data was not deleted; inspect the migration state and retry explicitly." >&2
  exit 1
fi

echo "Setup complete. Run 'make dev' to start development."
