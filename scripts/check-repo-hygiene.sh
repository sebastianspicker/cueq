#!/usr/bin/env bash
# Rejects forbidden private, generated, and local-only paths from the Git index.
# The index is authoritative because ignored files can still be force-added.
set -euo pipefail

violations=()

while IFS= read -r -d '' path; do
  if [[ "${path}" != */* ]]; then
    case "${path}" in
      *.dump | *.backup | *.sqlite | *.sqlite3 | *.db | *.sqlite-shm | *.sqlite-wal | \
        *.db-shm | *.db-wal | *-ledger.md | *_ledger.md | *-LEDGER.md | *_LEDGER.md | \
        *-audit.md | *_audit.md | *-status.md | *_status.md)
        violations+=("${path}")
        continue
        ;;
    esac
  fi

  case "${path}" in
    .env.example | .env.*.example | .env.sample | .env.template)
      ;;
    .DS_Store | */.DS_Store | .env | .env.* | */.env | */.env.* | \
      *.pem | *.key | *.p12 | *.pfx | *.cert | *.crt | *.cer | *.jks | *.keystore | \
      credentials.json | */credentials.json | service-account*.json | */service-account*.json | \
      id_rsa* | */id_rsa* | id_ed25519* | */id_ed25519* | \
      *.log | *.sarif | *.har | *.tmp | *.orig | *.rej | *.swp | *.swo | *.lcov | \
      *.pid | *.pid.lock | \
      .agent/* | */.agent/* | .agents/* | */.agents/* | .ai/* | */.ai/* | \
      .claude/* | */.claude/* | .codex/* | */.codex/* | .codegraph/* | */.codegraph/* | \
      .cursor/* | */.cursor/* | .impeccable/* | */.impeccable/* | .kilo/* | */.kilo/* | \
      .repowise/* | */.repowise/* | .serena/* | */.serena/* | .vscode/* | */.vscode/* | \
      .codacy/codacy.config.json | .codacy/codacy.yaml | \
      .idea/* | .fleet/* | .history/* | .zed/* | .pnpm-store/* | .cache/* | */.cache/* | \
      .eslintcache | */.eslintcache | .stylelintcache | */.stylelintcache | node_modules/* | \
      */node_modules/* | .turbo/* | */.turbo/* | dist/* | */dist/* | .next/* | \
      */.next/* | out/* | coverage/* | */coverage/* | tmp/* | temp/* | \
      artifacts/* | backups/* | exports/* | reports/* | \
      agent-prompts/* | ai-prompts/* | archive/* | docs/agent/* | docs/archive/* | prompt/* | prompts/* | \
      .cursorrules | openclaw.json | */openclaw.json | AGENT.md | */AGENT.md | AGENTS.md | */AGENTS.md | \
      agent.md | */agent.md | agents.md | */agents.md | CLAUDE.md | */CLAUDE.md | CODEX.md | \
      */CODEX.md | GEMINI.md | */GEMINI.md | copilot-instructions.md | */copilot-instructions.md | \
      agent-context* | agent-memory* | agent-notes* | agent-output* | agent-report* | \
      AI_AUDIT* | AI_NOTES* | AI_REPORT* | AI_SUMMARY* | CHATGPT_NOTES* | GPT_NOTES* | LLM_NOTES* | \
      handoff* | handover* | implementation-notes* | plan.md | PLAN.md | progress.md | scratchpad* | \
      status.md | STATUS.md | devlog* | development-log* | worklog* | work-log* | \
      REMEDIATION.md | REMEDIATION_PLAN.md)
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
