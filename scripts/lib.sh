#!/usr/bin/env bash
set -euo pipefail

PINNED_PNPM_VERSION="${PINNED_PNPM_VERSION:-9.15.0}"

run_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    local installed
    installed="$(pnpm -v || true)"
    if [[ "${installed}" == "${PINNED_PNPM_VERSION}" ]]; then
      pnpm "$@"
      return
    fi
  fi

  npx -y "pnpm@${PINNED_PNPM_VERSION}" "$@"
}

docker_compose_cmd() {
  if command -v docker-compose >/dev/null 2>&1; then
    echo "docker-compose"
    return
  fi

  echo "docker compose"
}
