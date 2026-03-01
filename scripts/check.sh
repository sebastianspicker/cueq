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
run_pnpm test
run_pnpm --filter @cueq/policy test:golden
"${SCRIPT_DIR}/openapi-check.sh"
