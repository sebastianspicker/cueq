#!/usr/bin/env bash
# Runs the ordered full repository gate, stopping on the first failed contract.
# The default database URL is local/disposable and may be overridden explicitly.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib.sh
source "${SCRIPT_DIR}/lib.sh"

"${SCRIPT_DIR}/check-repo-hygiene.sh"

export DATABASE_URL="${DATABASE_URL:-postgresql://cueq:cueq_dev_password@localhost:5433/cueq?schema=public}"

run_pnpm lint
run_pnpm format
run_pnpm typecheck
run_pnpm hygiene:code
run_pnpm docs:links
"${SCRIPT_DIR}/schemas.sh"
run_pnpm --filter @cueq/database db:migrate:deploy
run_pnpm test
"${SCRIPT_DIR}/openapi-check.sh"
