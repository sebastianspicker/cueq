#!/usr/bin/env bash
# Builds the API command and runs the fail-closed webhook-secret migration.
# Applying changes still requires the command's explicit maintenance confirmation.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib.sh
source "${SCRIPT_DIR}/lib.sh"

run_pnpm --filter '@cueq/api...' build
node apps/api/dist/commands/migrate-webhook-secrets.js "$@"
