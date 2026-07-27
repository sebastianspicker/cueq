#!/usr/bin/env bash
# Regenerates Prisma, OpenAPI, and documentation artifacts in dependency order
# so committed snapshots all describe the same source contracts.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib.sh
source "${SCRIPT_DIR}/lib.sh"

run_pnpm db:generate
run_pnpm --filter @cueq/api... build
run_pnpm --filter @cueq/api exec node dist/commands/export-openapi.js "${SCRIPT_DIR}/../contracts/openapi/openapi.json"
node "${SCRIPT_DIR}/generate-db-schema-doc.mjs"
node "${SCRIPT_DIR}/generate-core-schema-types.mjs"
