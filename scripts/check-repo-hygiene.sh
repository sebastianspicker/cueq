#!/usr/bin/env bash
# Rejects forbidden private, generated, and local-only paths from the Git index.
# The index is authoritative because ignored files can still be force-added.
set -euo pipefail

violations=()

while IFS= read -r -d '' path; do
  if [[ "${path}" != */* ]]; then
    case "${path}" in
      *.dump | *.backup | *.sqlite | *.sqlite3 | *.db | *.sqlite-shm | *.sqlite-wal | \
        *.db-shm | *.db-wal)
        violations+=("${path}")
        continue
        ;;
    esac
  fi

  case "${path}" in
    .env.example)
      ;;
    .DS_Store | */.DS_Store | .env | .env.* | */.env | */.env.* | \
      *.pem | *.key | *.p12 | *.pfx | *.cert | *.crt | *.cer | *.jks | *.keystore | \
      credentials.json | */credentials.json | service-account*.json | */service-account*.json | \
      id_rsa* | */id_rsa* | id_ed25519* | */id_ed25519* | \
      *.log | *.sarif | *.har | *.tmp | *.orig | *.rej | *.swp | *.swo | *.lcov | \
      *.pid | *.pid.lock | \
      .agents/* | .claude/* | .codex/* | .codegraph/* | .impeccable/* | .serena/* | .vscode/* | \
      .codacy/codacy.config.json | .codacy/codacy.yaml | \
      .idea/* | .fleet/* | .history/* | .zed/* | .pnpm-store/* | .cache/* | */.cache/* | \
      .eslintcache | */.eslintcache | .stylelintcache | */.stylelintcache | node_modules/* | \
      */node_modules/* | .turbo/* | */.turbo/* | dist/* | */dist/* | .next/* | \
      */.next/* | out/* | coverage/* | */coverage/* | tmp/* | temp/* | \
      backups/* | exports/* | reports/* | \
      docs/agent/* | apps/web/test-results/* | apps/web/playwright-report/* | \
      apps/web/blob-report/* | */blob-report/* | \
      openclaw.json | */openclaw.json | plan.md | status.md | PLAN.md | STATUS.md | REMEDIATION.md | \
      REMEDIATION_PLAN.md | agent.md | agent-notes.md | AGENT_NOTES.md | AGENTS.md)
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
