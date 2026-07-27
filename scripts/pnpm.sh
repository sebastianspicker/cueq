#!/usr/bin/env bash
# Thin entry point that forces all repository commands through the pinned pnpm resolver.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib.sh
source "${SCRIPT_DIR}/lib.sh"

run_pnpm "$@"
