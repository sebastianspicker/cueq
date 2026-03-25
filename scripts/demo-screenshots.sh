#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib.sh
source "${SCRIPT_DIR}/lib.sh"

REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUTPUT_DIR="${REPO_ROOT}/apps/web/test-results/demo-screenshots/latest"
EXPECTED_FILES=(
  "01-dashboard.png"
  "02-leave.png"
  "03-roster.png"
  "04-approvals.png"
  "05-closing.png"
  "06-reports.png"
)

COMPOSE_CMD="$(docker_compose_cmd)"

echo "🐳 Ensuring local PostgreSQL is running..."
${COMPOSE_CMD} up -d postgres

echo "📸 Running mock university screenshot automation..."
run_pnpm --filter @cueq/web test:demo-screenshots

if [[ ! -d "${OUTPUT_DIR}" ]]; then
  echo "❌ Screenshot output directory was not created: ${OUTPUT_DIR}"
  exit 1
fi

missing=0
for file in "${EXPECTED_FILES[@]}"; do
  if [[ ! -f "${OUTPUT_DIR}/${file}" ]]; then
    echo "❌ Missing screenshot: ${OUTPUT_DIR}/${file}"
    missing=1
  fi
done

png_count="$(find "${OUTPUT_DIR}" -maxdepth 1 -type f -name '*.png' | wc -l | tr -d ' ')"
if [[ "${png_count}" != "6" ]]; then
  echo "❌ Expected exactly 6 screenshot files, found ${png_count}."
  echo "   Directory: ${OUTPUT_DIR}"
  find "${OUTPUT_DIR}" -maxdepth 1 -type f -name '*.png' -print | sort
  exit 1
fi

if [[ "${missing}" != "0" ]]; then
  exit 1
fi

echo "✅ Demo screenshots generated successfully."
echo "📁 Output: ${OUTPUT_DIR}"
