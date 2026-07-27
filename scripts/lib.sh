#!/usr/bin/env bash
# Shared shell helpers resolve the exact pnpm version and the available Docker
# Compose command so nested scripts use one reproducible execution boundary.
set -euo pipefail

PINNED_PNPM_VERSION="9.15.0"
PNPM_SHIM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/shims"

run_pnpm() {
  local installed

  if command -v corepack >/dev/null 2>&1; then
    installed="$(corepack pnpm --version 2>/dev/null || true)"
    if [[ "${installed}" == "${PINNED_PNPM_VERSION}" ]]; then
      PATH="${PNPM_SHIM_DIR}:${PATH}" corepack pnpm "$@"
      return
    fi
  fi

  if command -v pnpm >/dev/null 2>&1; then
    installed="$(pnpm -v 2>/dev/null || true)"
    if [[ "${installed}" == "${PINNED_PNPM_VERSION}" ]]; then
      pnpm "$@"
      return
    fi
  fi

  PATH="${PNPM_SHIM_DIR}:${PATH}" npx -y "pnpm@${PINNED_PNPM_VERSION}" "$@"
}

docker_compose_cmd() {
  if command -v docker-compose >/dev/null 2>&1; then
    echo "docker-compose"
    return
  fi

  echo "docker compose"
}
