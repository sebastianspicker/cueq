#!/usr/bin/env bash
# Exercises the hygiene checker against disposable Git repositories so changes
# to ignore rules cannot silently weaken the public release boundary.
set -euo pipefail

# Fixture repositories must use their own indexes even when the caller is
# validating a candidate through an alternate GIT_INDEX_FILE.
unset GIT_INDEX_FILE

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

repo="$(create_repo private-tool-state)"
mkdir -p "${repo}/.impeccable"
printf '%s\n' '{}' > "${repo}/.impeccable/design.json"
git -C "${repo}" add -f .impeccable/design.json
assert_rejects "${repo}" ".impeccable/design.json"

repo="$(create_repo nested-agent-state)"
mkdir -p "${repo}/.agents/session"
printf '%s\n' '{}' > "${repo}/.agents/session/state.json"
git -C "${repo}" add -f .agents/session/state.json
assert_rejects "${repo}" ".agents/session/state.json"

repo="$(create_repo local-codacy-metadata)"
mkdir -p "${repo}/.codacy"
printf '%s\n' '{"metadata":{"source":"auto"}}' > "${repo}/.codacy/codacy.config.json"
git -C "${repo}" add -f .codacy/codacy.config.json
assert_rejects "${repo}" ".codacy/codacy.config.json"

repo="$(create_repo public-audit-document)"
mkdir -p "${repo}/docs/reviews"
printf '%s\n' "public audit" > "${repo}/docs/reviews/security-audit.md"
git -C "${repo}" add -f docs/reviews/security-audit.md
assert_passes "${repo}"

repo="$(create_repo remediation-plan)"
printf '%s\n' "local remediation notes" > "${repo}/REMEDIATION_PLAN.md"
git -C "${repo}" add -f REMEDIATION_PLAN.md
assert_rejects "${repo}" "REMEDIATION_PLAN.md"

repo="$(create_repo agent-notes)"
printf '%s\n' "local agent notes" > "${repo}/agent-notes.md"
git -C "${repo}" add -f agent-notes.md
assert_rejects "${repo}" "agent-notes.md"

repo="$(create_repo repository-agent-instructions)"
printf '%s\n' "local repository instructions" > "${repo}/AGENTS.md"
git -C "${repo}" add -f AGENTS.md
assert_rejects "${repo}" "AGENTS.md"

repo="$(create_repo credentials)"
mkdir -p "${repo}/local"
printf '%s\n' '{"token":"synthetic-test-value"}' > "${repo}/local/credentials.json"
git -C "${repo}" add -f local/credentials.json
assert_rejects "${repo}" "local/credentials.json"

repo="$(create_repo service-account)"
printf '%s\n' '{"type":"synthetic-test-fixture"}' > "${repo}/service-account-local.json"
git -C "${repo}" add -f service-account-local.json
assert_rejects "${repo}" "service-account-local.json"

repo="$(create_repo ssh-key)"
mkdir -p "${repo}/local"
printf '%s\n' "synthetic-test-key" > "${repo}/local/id_ed25519"
git -C "${repo}" add -f local/id_ed25519
assert_rejects "${repo}" "local/id_ed25519"

repo="$(create_repo private-export)"
mkdir -p "${repo}/exports"
printf '%s\n' "synthetic spreadsheet placeholder" > "${repo}/exports/payroll.xlsx"
git -C "${repo}" add -f exports/payroll.xlsx
assert_rejects "${repo}" "exports/payroll.xlsx"

repo="$(create_repo root-database)"
printf '%s\n' "synthetic local database placeholder" > "${repo}/cueq.sqlite"
git -C "${repo}" add -f cueq.sqlite
assert_rejects "${repo}" "cueq.sqlite"

repo="$(create_repo synthetic-archive-fixture)"
mkdir -p "${repo}/fixtures"
printf '%s\n' "synthetic archive placeholder" > "${repo}/fixtures/reference.zip"
git -C "${repo}" add fixtures/reference.zip
assert_passes "${repo}"

repo="$(create_repo playwright-blob-report)"
mkdir -p "${repo}/apps/web/blob-report"
printf '%s\n' "synthetic browser report" > "${repo}/apps/web/blob-report/report.zip"
git -C "${repo}" add -f apps/web/blob-report/report.zip
assert_rejects "${repo}" "apps/web/blob-report/report.zip"

repo="$(create_repo nested-tool-cache)"
mkdir -p "${repo}/apps/web/.cache"
printf '%s\n' "local cache" > "${repo}/apps/web/.cache/state.json"
git -C "${repo}" add -f apps/web/.cache/state.json
assert_rejects "${repo}" "apps/web/.cache/state.json"

repo="$(create_repo unstaged-deleted-forbidden-file)"
printf '%s\n' "local-only" > "${repo}/.env"
git -C "${repo}" add .env
git -C "${repo}" commit --quiet -m "Track forbidden fixture"
rm "${repo}/.env"
assert_rejects "${repo}" ".env"

repo="$(create_repo staged-deleted-forbidden-file)"
printf '%s\n' "local-only" > "${repo}/.env"
git -C "${repo}" add .env
git -C "${repo}" commit --quiet -m "Track forbidden fixture"
git -C "${repo}" rm --quiet .env
assert_passes "${repo}"

repo="$(create_repo broken-symlink)"
mkdir -p "${repo}/.codex"
ln -s "missing-target" "${repo}/.codex/broken-link"
git -C "${repo}" add .codex/broken-link
assert_rejects "${repo}" ".codex/broken-link"

echo "check-repo-hygiene regression tests passed."
