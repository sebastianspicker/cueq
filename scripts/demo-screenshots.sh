#!/usr/bin/env bash
# Generates the exact six synthetic UI captures and replaces public copies only
# after Playwright succeeds and the complete filename manifest is validated.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib.sh
source "${SCRIPT_DIR}/lib.sh"

REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUTPUT_DIR="${REPO_ROOT}/apps/web/test-results/demo-screenshots/latest"
PUBLIC_OUTPUT_DIR="${REPO_ROOT}/docs/assets/screenshots/alpha"
EXPECTED_FILES=(
  "01-dashboard.png"
  "02-leave.png"
  "03-roster.png"
  "04-approvals.png"
  "05-closing.png"
  "06-reports.png"
)

echo "Running deterministic mock-university frontend screenshot automation..."
run_pnpm --filter @cueq/web test:demo-screenshots

if [[ ! -d "${OUTPUT_DIR}" ]]; then
  echo "Screenshot output directory was not created: ${OUTPUT_DIR}"
  exit 1
fi

missing=0
for file in "${EXPECTED_FILES[@]}"; do
  if [[ ! -f "${OUTPUT_DIR}/${file}" ]]; then
    echo "Missing screenshot: ${OUTPUT_DIR}/${file}"
    missing=1
  fi
done

png_count="$(find "${OUTPUT_DIR}" -maxdepth 1 -type f -name '*.png' | wc -l | tr -d ' ')"
if [[ "${png_count}" != "6" ]]; then
  echo "Expected exactly 6 screenshot files, found ${png_count}."
  echo "   Directory: ${OUTPUT_DIR}"
  find "${OUTPUT_DIR}" -maxdepth 1 -type f -name '*.png' -print | sort
  exit 1
fi

if [[ "${missing}" != "0" ]]; then
  exit 1
fi

mkdir -p "${PUBLIC_OUTPUT_DIR}"
unexpected_public_file=0
while IFS= read -r existing_file; do
  existing_name="${existing_file##*/}"
  expected_public_file=0
  for file in "${EXPECTED_FILES[@]}"; do
    if [[ "${existing_name}" == "${file}" ]]; then
      expected_public_file=1
      break
    fi
  done
  if [[ "${expected_public_file}" == "0" ]]; then
    echo "Unexpected public screenshot: ${existing_name}" >&2
    unexpected_public_file=1
  fi
done < <(find "${PUBLIC_OUTPUT_DIR}" -maxdepth 1 -type f -name '*.png' -print)

if [[ "${unexpected_public_file}" != "0" ]]; then
  echo "Refusing to remove or overwrite an unrecognized public screenshot." >&2
  exit 1
fi

for file in "${EXPECTED_FILES[@]}"; do
  cp "${OUTPUT_DIR}/${file}" "${PUBLIC_OUTPUT_DIR}/${file}"
done

echo "Demo screenshots generated successfully."
echo "Test output: ${OUTPUT_DIR}"
echo "Public documentation assets: ${PUBLIC_OUTPUT_DIR}"
