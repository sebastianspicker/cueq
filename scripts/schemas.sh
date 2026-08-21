#!/usr/bin/env bash
# Validates committed domain schema definitions.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

node "${SCRIPT_DIR}/validate-schemas.mjs"
