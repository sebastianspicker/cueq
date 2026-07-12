#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECKER="${SCRIPT_DIR}/check-repo-hygiene.sh"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/cueq-hygiene.XXXXXX")"

cleanup() {
  rm -rf "${TEMP_DIR}"
}
trap cleanup EXIT

fail() {
  echo "check-repo-hygiene regression failure: $*" >&2
  exit 1
}

create_repo() {
  local name="$1"
  local repo="${TEMP_DIR}/${name}"

  mkdir -p "${repo}"
  git -C "${repo}" init --quiet
  git -C "${repo}" config user.email "hygiene-test@example.invalid"
  git -C "${repo}" config user.name "Hygiene Test"
  printf '%s\n' "fixture" > "${repo}/README.md"
  git -C "${repo}" add README.md
  git -C "${repo}" commit --quiet -m "Initial fixture"
  printf '%s' "${repo}"
}

assert_passes() {
  local repo="$1"

  if ! (cd "${repo}" && "${CHECKER}"); then
    fail "expected hygiene check to pass in ${repo}"
  fi
}

assert_rejects() {
  local repo="$1"
  local expected_path="$2"
  local output

  if output="$(cd "${repo}" && "${CHECKER}" 2>&1)"; then
    fail "expected hygiene check to reject ${expected_path}"
  fi
  [[ "${output}" == *"${expected_path}"* ]] || fail "missing ${expected_path} in checker output"
}

repo="$(create_repo env-example)"
printf '%s\n' "EXAMPLE_VALUE=replace-me" > "${repo}/.env.example"
git -C "${repo}" add .env.example
assert_passes "${repo}"

repo="$(create_repo forbidden-file)"
printf '%s\n' '{}' > "${repo}/openclaw.json"
git -C "${repo}" add openclaw.json
assert_rejects "${repo}" "openclaw.json"

repo="$(create_repo private-export)"
printf '%s\n' "synthetic spreadsheet placeholder" > "${repo}/payroll.xlsx"
git -C "${repo}" add -f payroll.xlsx
assert_rejects "${repo}" "payroll.xlsx"

repo="$(create_repo deleted-forbidden-file)"
printf '%s\n' "local-only" > "${repo}/.env"
git -C "${repo}" add .env
git -C "${repo}" commit --quiet -m "Track forbidden fixture"
rm "${repo}/.env"
assert_passes "${repo}"

repo="$(create_repo broken-symlink)"
mkdir -p "${repo}/.codex"
ln -s "missing-target" "${repo}/.codex/broken-link"
git -C "${repo}" add .codex/broken-link
assert_rejects "${repo}" ".codex/broken-link"

echo "check-repo-hygiene regression tests passed."
