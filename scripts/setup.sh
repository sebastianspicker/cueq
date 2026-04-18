#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib.sh
source "${SCRIPT_DIR}/lib.sh"

export DATABASE_URL="${DATABASE_URL:-postgresql://cueq:cueq_dev_password@localhost:5433/cueq?schema=public}"
COMPOSE_CMD="$(docker_compose_cmd)"
STARTED_DOCKER=0

echo "📦 Installing dependencies..."
run_pnpm install

if [[ "${SKIP_DOCKER:-0}" != "1" ]]; then
  echo "🐳 Starting Docker services..."
  if ${COMPOSE_CMD} up -d; then
    STARTED_DOCKER=1
    echo "⏳ Waiting for PostgreSQL..."
    sleep 3
  else
    echo "⚠️ Docker services could not be started. Continuing with the existing DATABASE_URL target."
  fi
fi

echo "🔧 Generating Prisma client..."
run_pnpm db:generate

echo "🗄️  Applying migrations to database..."
if ! run_pnpm --filter @cueq/database db:migrate:deploy; then
  if [[ "${STARTED_DOCKER}" == "1" ]]; then
    echo "⚠️ Database migration failed. Recreating local postgres volume and retrying once..."
    ${COMPOSE_CMD} down -v
    ${COMPOSE_CMD} up -d
    sleep 3
    run_pnpm --filter @cueq/database db:migrate:deploy
  else
    exit 1
  fi
fi

echo "✅ Setup complete. Run 'make dev' to start development."
