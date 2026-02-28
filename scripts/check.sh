#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib.sh
source "${SCRIPT_DIR}/lib.sh"

run_pnpm lint
run_pnpm format
run_pnpm typecheck
"${SCRIPT_DIR}/schemas.sh"
run_pnpm test
run_pnpm --filter @cueq/policy test:golden
"${SCRIPT_DIR}/openapi-check.sh"
