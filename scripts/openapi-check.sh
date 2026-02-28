#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib.sh
source "${SCRIPT_DIR}/lib.sh"

SNAPSHOT_FILE="${SCRIPT_DIR}/../contracts/openapi/openapi.json"
GENERATED_FILE="${SCRIPT_DIR}/../contracts/openapi/openapi.generated.json"

if [[ ! -f "${SNAPSHOT_FILE}" ]]; then
  echo "OpenAPI snapshot not found at ${SNAPSHOT_FILE}. Run 'make generate' first."
  exit 1
fi

run_pnpm --filter @cueq/api exec tsc --project tsconfig.json --incremental false
run_pnpm --filter @cueq/api exec node ../../scripts/export-openapi.mjs "${GENERATED_FILE}"

if ! diff -u "${SNAPSHOT_FILE}" "${GENERATED_FILE}"; then
  echo ""
  echo "OpenAPI snapshot drift detected. Run 'make generate' and commit the updated snapshot."
  exit 1
fi

rm -f "${GENERATED_FILE}"
echo "OpenAPI snapshot check passed."
