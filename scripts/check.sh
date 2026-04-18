#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib.sh
source "${SCRIPT_DIR}/lib.sh"

export DATABASE_URL="${DATABASE_URL:-postgresql://cueq:cueq_dev_password@localhost:5433/cueq?schema=public}"

run_pnpm lint
run_pnpm format
run_pnpm typecheck
run_pnpm docs:links
"${SCRIPT_DIR}/schemas.sh"
run_pnpm --filter @cueq/database db:migrate:deploy
run_pnpm test:unit
run_pnpm test:integration
run_pnpm test:acceptance
run_pnpm test:compliance
run_pnpm test:backup-restore
run_pnpm --filter @cueq/policy test:golden
"${SCRIPT_DIR}/openapi-check.sh"
