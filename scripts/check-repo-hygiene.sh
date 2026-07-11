#!/usr/bin/env bash
set -euo pipefail

violations=()
deleted_paths=()

while IFS= read -r -d '' deleted_path; do
  deleted_paths+=("${deleted_path}")
done < <(git ls-files --deleted -z)

while IFS= read -r -d '' path; do
  # `-e` would also skip broken symlinks. Explicitly skip only paths Git marks
  # as deleted, so tracked broken symlinks are still reported.
  is_deleted=false
  for deleted_path in "${deleted_paths[@]}"; do
    if [[ "${path}" == "${deleted_path}" ]]; then
      is_deleted=true
      break
    fi
  done
  if [[ "${is_deleted}" == true ]]; then
    continue
  fi

  case "${path}" in
    .env.example)
      ;;
    .DS_Store | */.DS_Store | .env | .env.* | */.env | */.env.* | \
      *.pem | *.key | *.p12 | *.pfx | *.cert | *.crt | *.cer | *.jks | *.keystore | \
      *.log | *.sarif | *.har | *.dump | *.backup | *.sqlite | *.sqlite3 | *.db | \
      *.sqlite-shm | *.sqlite-wal | *.db-shm | *.db-wal | \
      *.xlsx | *.xls | *.ods | *.numbers | *.ics | *.eml | *.msg | *.mbox | \
      *.pst | *.ost | *.olm | *.vcf | *.zip | *.7z | *.tar | *.tar.gz | *.tgz | \
      .agents/* | .claude/* | .codex/* | .codegraph/* | .serena/* | .vscode/* | \
      .idea/* | .fleet/* | .history/* | .zed/* | .pnpm-store/* | node_modules/* | \
      */node_modules/* | .turbo/* | */.turbo/* | dist/* | */dist/* | .next/* | \
      */.next/* | coverage/* | */coverage/* | backups/* | exports/* | reports/* | \
      docs/archive/* | docs/agent/* | apps/web/test-results/* | apps/web/playwright-report/* | \
      openclaw.json | plan.md | status.md | *-ledger.md | *-status.md | *-audit.md)
      violations+=("${path}")
      ;;
  esac
done < <(git ls-files -z)

if ((${#violations[@]} > 0)); then
  echo "Tracked repository-hygiene violations:" >&2
  printf '  %s\n' "${violations[@]}" >&2
  exit 1
fi

echo "Repository hygiene check passed: no forbidden tracked paths."
