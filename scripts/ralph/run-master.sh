#!/usr/bin/env bash
set -euo pipefail

# Ralph Loop Master Orchestrator
# Runs all 7 phases in sequence with git checkpoints between each.
#
# Usage: ./scripts/ralph/run-master.sh [start-phase]
# Resume: ./scripts/ralph/run-master.sh 4    (resume from phase 4)
#
# Phases:
#   1  Foundation       — schemas, database, type generation
#   2  Core Domain      — time engine, absence/workflow, roster/closing
#   3  Policy Engine    — golden tests, compliance edge cases
#   4  API Layer        — service decomposition, security, error handling
#   5  Frontend         — page quality, i18n/components
#   6  Testing          — coverage gaps, edge cases, quality
#   7  Infrastructure   — CI/scripts, documentation

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
START_PHASE="${1:-1}"
RESULTS_FILE=".claude/ralph-loops/logs/master-results.txt"
mkdir -p "$(dirname "$RESULTS_FILE")"

PHASE_NAMES=(
  ""
  "Foundation"
  "Core Domain"
  "Policy Engine"
  "API Layer"
  "Frontend"
  "Testing"
  "Infrastructure"
)

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║        RALPH LOOP MASTER ORCHESTRATOR                   ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Phases:  ${START_PHASE} through 7                               ║"
echo "║  Started: $(date -Iseconds)                  ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Ensure Docker services are running (PostgreSQL needed for tests)
echo ">>> Ensuring Docker services are running..."
if command -v docker &>/dev/null && docker compose version &>/dev/null; then
  docker compose -f "$REPO_ROOT/docker-compose.yml" up -d --wait 2>/dev/null || true
  echo "  Docker services started."
else
  echo "  WARNING: Docker not available. Database-dependent tests may fail."
fi
echo ""

if [[ "$START_PHASE" -gt 1 ]]; then
  echo "NOTE: Resuming from Phase ${START_PHASE} (${PHASE_NAMES[$START_PHASE]})"
  echo "      Phases 1-$((START_PHASE - 1)) assumed complete."
  echo ""
fi

for PHASE in $(seq "$START_PHASE" 7); do
  PHASE_NAME="${PHASE_NAMES[$PHASE]}"

  echo ""
  echo "┌──────────────────────────────────────────────────────┐"
  echo "│  >>> Phase ${PHASE}: ${PHASE_NAME}"
  echo "│  >>> Starting at $(date -Iseconds)"
  echo "└──────────────────────────────────────────────────────┘"
  echo ""

  if "${SCRIPT_DIR}/run-phase.sh" "$PHASE"; then
    echo "Phase ${PHASE} (${PHASE_NAME}): PASS ($(date -Iseconds))" >> "$RESULTS_FILE"
    echo ""
    echo ">>> Phase ${PHASE} (${PHASE_NAME}) PASSED"

    # Git checkpoint
    echo ">>> Creating git checkpoint..."
    git add -A
    git commit -m "chore(ralph): complete phase ${PHASE} — ${PHASE_NAME}

Automated Ralph Loop phase ${PHASE} completion checkpoint.
All sub-phase verification commands passed.
Phase gate verification passed.

Co-Authored-By: Claude Code <noreply@anthropic.com>" || echo "  (nothing to commit)"

  else
    echo "Phase ${PHASE} (${PHASE_NAME}): FAIL ($(date -Iseconds))" >> "$RESULTS_FILE"
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║  STOPPED: Phase ${PHASE} (${PHASE_NAME}) FAILED"
    echo "╠══════════════════════════════════════════════════════════╣"
    echo "║  Fix the issues, then resume with:                      ║"
    echo "║  ./scripts/ralph/run-master.sh ${PHASE}                          ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    exit 1
  fi
done

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  FINAL GATE: make check && make test-all                ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

if make check && make test-all; then
  echo ""
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║                                                          ║"
  echo "║    ALL 7 PHASES COMPLETE                                 ║"
  echo "║    Finished: $(date -Iseconds)                   ║"
  echo "║                                                          ║"
  echo "╚══════════════════════════════════════════════════════════╝"
else
  echo ""
  echo "WARNING: Final gate failed. Review logs in .claude/ralph-loops/logs/"
  exit 1
fi
