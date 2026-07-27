#!/usr/bin/env bash
# Validates schema definitions before checking every synthetic fixture against them.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

node "${SCRIPT_DIR}/validate-schemas.mjs"
node "${SCRIPT_DIR}/validate-fixtures.mjs"
