#!/usr/bin/env bash
# Builds a fresh OpenAPI document and byte-compares it with the committed public
# snapshot, leaving the generated candidate available only for diagnosis.
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

run_pnpm db:generate
run_pnpm --filter @cueq/api... build
run_pnpm --filter @cueq/api exec node dist/commands/export-openapi.js "${GENERATED_FILE}"

if ! diff -u "${SNAPSHOT_FILE}" "${GENERATED_FILE}"; then
  echo ""
  echo "OpenAPI snapshot drift detected. Run 'make generate' and commit the updated snapshot."
  exit 1
fi

rm -f "${GENERATED_FILE}"
echo "OpenAPI snapshot check passed."
