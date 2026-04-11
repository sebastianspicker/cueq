#!/usr/bin/env bash
set -euo pipefail

# Ralph Loop Phase Orchestrator
# Sequences sub-phases within a single phase, running verification between each.
#
# Usage: ./scripts/ralph/run-phase.sh <phase-number>
# Example: ./scripts/ralph/run-phase.sh 1

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <phase-number>"
  echo ""
  echo "Phases:"
  echo "  1  Foundation (schemas, database, type generation)"
  echo "  2  Core Domain (time engine, absence/workflow, roster/closing)"
  echo "  3  Policy Engine (golden tests, compliance edge cases)"
  echo "  4  API Layer (service decomposition, security, error handling)"
  echo "  5  Frontend (page quality, i18n/components)"
  echo "  6  Testing (coverage gaps, edge cases, quality)"
  echo "  7  Infrastructure (CI/scripts, documentation)"
  exit 1
fi

PHASE="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
R="${SCRIPT_DIR}/run-subphase.sh"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  PHASE ${PHASE} ORCHESTRATOR"
echo "║  Started: $(date -Iseconds)"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

case "$PHASE" in
  1)
    echo ">>> Phase 1: Foundation (Schemas, Database, Types)"
    echo ""

    "$R" .claude/ralph-loops/P1-foundation/P1.1-schema-integrity.md \
      15 "P1.1-SCHEMA-INTEGRITY-COMPLETE" "make schemas && make typecheck"

    "$R" .claude/ralph-loops/P1-foundation/P1.2-database-model-audit.md \
      10 "P1.2-DATABASE-MODEL-COMPLETE" "make db-generate && make typecheck && make test-unit"

    "$R" .claude/ralph-loops/P1-foundation/P1.3-type-generation-consistency.md \
      8 "P1.3-TYPE-GENERATION-COMPLETE" "make generate && make typecheck && make schemas"

    echo ""
    echo "=== Phase 1 Gate: make check ==="
    make check
    ;;

  2)
    echo ">>> Phase 2: Core Domain (Business Logic)"
    echo ""

    "$R" .claude/ralph-loops/P2-core-domain/P2.1-time-engine-edge-cases.md \
      12 "P2.1-TIME-ENGINE-COMPLETE" "make test-unit"

    "$R" .claude/ralph-loops/P2-core-domain/P2.2-absence-workflow-correctness.md \
      12 "P2.2-ABSENCE-WORKFLOW-COMPLETE" "make test-unit"

    "$R" .claude/ralph-loops/P2-core-domain/P2.3-roster-closing-hardening.md \
      10 "P2.3-ROSTER-CLOSING-COMPLETE" "make test-unit && make test-compliance"

    echo ""
    echo "=== Phase 2 Gate: make test-unit && make test-compliance ==="
    make test-unit && make test-compliance
    ;;

  3)
    echo ">>> Phase 3: Policy Engine"
    echo ""

    "$R" .claude/ralph-loops/P3-policy-engine/P3.1-rule-coverage-golden-tests.md \
      10 "P3.1-GOLDEN-TESTS-COMPLETE" "pnpm --filter @cueq/policy test:golden && make test-unit"

    "$R" .claude/ralph-loops/P3-policy-engine/P3.2-policy-compliance-edge-cases.md \
      8 "P3.2-POLICY-COMPLIANCE-COMPLETE" "make test-unit && make test-compliance"

    echo ""
    echo "=== Phase 3 Gate: make test-unit && make test-compliance ==="
    make test-unit && make test-compliance
    ;;

  4)
    echo ">>> Phase 4: API Layer"
    echo ""

    "$R" .claude/ralph-loops/P4-api-layer/P4.1-service-decomposition-quality.md \
      15 "P4.1-SERVICE-DECOMPOSITION-COMPLETE" "make typecheck && make test-unit && make test-integration"

    "$R" .claude/ralph-loops/P4-api-layer/P4.2-controller-security-validation.md \
      10 "P4.2-CONTROLLER-SECURITY-COMPLETE" "make typecheck && make test-unit && make test-compliance"

    "$R" .claude/ralph-loops/P4-api-layer/P4.3-error-handling-audit.md \
      10 "P4.3-ERROR-HANDLING-COMPLETE" "make test-unit && make test-integration"

    echo ""
    echo "=== Phase 4 Gate: make typecheck && make test-unit && make test-integration && make test-compliance ==="
    make typecheck && make test-unit && make test-integration && make test-compliance
    ;;

  5)
    echo ">>> Phase 5: Frontend"
    echo ""

    "$R" .claude/ralph-loops/P5-frontend/P5.1-page-quality-a11y.md \
      12 "P5.1-PAGE-QUALITY-COMPLETE" "make typecheck && pnpm --filter @cueq/web test"

    "$R" .claude/ralph-loops/P5-frontend/P5.2-i18n-component-consistency.md \
      10 "P5.2-I18N-COMPONENTS-COMPLETE" "make typecheck && pnpm --filter @cueq/web test"

    echo ""
    echo "=== Phase 5 Gate: make quick ==="
    make quick
    ;;

  6)
    echo ">>> Phase 6: Testing"
    echo ""

    "$R" .claude/ralph-loops/P6-testing/P6.1-coverage-gap-analysis.md \
      15 "P6.1-COVERAGE-ANALYSIS-COMPLETE" "make test-unit"

    "$R" .claude/ralph-loops/P6-testing/P6.2-missing-edge-case-tests.md \
      12 "P6.2-EDGE-CASE-TESTS-COMPLETE" "make test-unit && make test-integration && make test-compliance"

    "$R" .claude/ralph-loops/P6-testing/P6.3-test-quality-reliability.md \
      10 "P6.3-TEST-QUALITY-COMPLETE" "make test-unit"

    echo ""
    echo "=== Phase 6 Gate: make test-unit && make test-integration && make test-compliance ==="
    make test-unit && make test-integration && make test-compliance
    ;;

  7)
    echo ">>> Phase 7: Infrastructure"
    echo ""

    "$R" .claude/ralph-loops/P7-infrastructure/P7.1-ci-scripts-hardening.md \
      10 "P7.1-CI-SCRIPTS-COMPLETE" "make check"

    "$R" .claude/ralph-loops/P7-infrastructure/P7.2-docs-cross-link-completeness.md \
      8 "P7.2-DOCS-COMPLETE" "pnpm docs:links && make docs-check"

    echo ""
    echo "=== Phase 7 Gate: make check ==="
    make check
    ;;

  *)
    echo "ERROR: Unknown phase: $PHASE"
    echo "Valid phases: 1-7"
    exit 1
    ;;
esac

echo ""
echo "════════════════════════════════════════════════"
echo "  Phase ${PHASE}: ALL SUB-PHASES COMPLETE"
echo "  Finished: $(date -Iseconds)"
echo "════════════════════════════════════════════════"
