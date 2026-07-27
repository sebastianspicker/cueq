#!/usr/bin/env bash
# Starts local development only after a readable environment file is selected;
# Node parses that file so shell interpolation cannot change configured values.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${CUEQ_ENV_FILE:-${REPO_ROOT}/.env}"

if [[ ! -r "${ENV_FILE}" ]]; then
  echo "Cannot start cueq: readable environment file not found at ${ENV_FILE}." >&2
  echo "Copy .env.example to .env, configure local-only values, and retry." >&2
  exit 1
fi

cd "${REPO_ROOT}"
exec node --env-file="${ENV_FILE}" "${SCRIPT_DIR}/dev.mjs"
