#!/usr/bin/env bash
set -euo pipefail

# Ralph Loop Sub-Phase Runner
# Implements the Ralph Wiggum technique: same prompt fed repeatedly,
# Claude sees its own previous work in the files and iterates.
#
# Usage: ./scripts/ralph/run-subphase.sh <prompt-file> <max-iters> <promise-text> <verify-cmd>
#
# Example:
#   ./scripts/ralph/run-subphase.sh \
#     .claude/ralph-loops/P1-foundation/P1.1-schema-integrity.md \
#     15 \
#     "P1.1-SCHEMA-INTEGRITY-COMPLETE" \
#     "make schemas && make typecheck"

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <prompt-file> <max-iters> <promise-text> [verify-cmd]"
  echo ""
  echo "Arguments:"
  echo "  prompt-file   Path to the Ralph Loop prompt .md file"
  echo "  max-iters     Maximum iterations before auto-stop"
  echo "  promise-text  Completion promise text (signals loop is done)"
  echo "  verify-cmd    Post-loop verification command (default: make check)"
  exit 1
fi

PROMPT_FILE="$1"
MAX_ITERS="${2:-10}"
PROMISE_TEXT="$3"
VERIFY_CMD="${4:-make check}"

SUBPHASE_ID="$(basename "$PROMPT_FILE" .md)"
LOG_DIR=".claude/ralph-loops/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/${SUBPHASE_ID}.log"

# Read the prompt content
if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "ERROR: Prompt file not found: $PROMPT_FILE"
  exit 1
fi
PROMPT_CONTENT="$(cat "$PROMPT_FILE")"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Ralph Loop: ${SUBPHASE_ID}"
echo "╠══════════════════════════════════════════════════╣"
echo "║  Prompt:  ${PROMPT_FILE}"
echo "║  Max:     ${MAX_ITERS} iterations"
echo "║  Promise: ${PROMISE_TEXT}"
echo "║  Verify:  ${VERIFY_CMD}"
echo "║  Log:     ${LOG_FILE}"
echo "║  Started: $(date -Iseconds)"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Clear previous log
: > "$LOG_FILE"

PROMISE_FOUND=false

for ITER in $(seq 1 "$MAX_ITERS"); do
  echo ""
  echo "--- Iteration ${ITER}/${MAX_ITERS} ($(date -Iseconds)) ---"
  echo "--- Iteration ${ITER}/${MAX_ITERS} ($(date -Iseconds)) ---" >> "$LOG_FILE"

  # Run Claude with the prompt, piping content via stdin
  ITER_OUTPUT=""
  ITER_EXIT=0
  ITER_OUTPUT=$(echo "$PROMPT_CONTENT" | claude \
    --print \
    --dangerously-skip-permissions \
    --verbose \
    2>&1) || ITER_EXIT=$?

  # Append output to log
  echo "$ITER_OUTPUT" >> "$LOG_FILE"
  echo "$ITER_OUTPUT"

  echo ""
  echo "--- Iteration ${ITER} exited with code ${ITER_EXIT} ---"

  # Auto-format any changes Claude made (prevents Prettier failures at phase gate)
  pnpm format:fix --log-level silent 2>/dev/null || true

  # Check for completion promise
  if echo "$ITER_OUTPUT" | grep -q "<promise>${PROMISE_TEXT}</promise>"; then
    echo "Promise detected: ${PROMISE_TEXT} (iteration ${ITER})"
    PROMISE_FOUND=true
    break
  fi

  # If Claude errored, still continue — next iteration may self-correct
  if [[ $ITER_EXIT -ne 0 ]]; then
    echo "WARNING: Claude exited with code ${ITER_EXIT}, continuing to next iteration..."
  fi
done

echo ""
if [[ "$PROMISE_FOUND" == "true" ]]; then
  echo "Loop completed: promise detected after ${ITER} iteration(s)"
else
  echo "WARNING: Loop exhausted ${MAX_ITERS} iterations without completion promise."
fi

# Post-loop verification
echo ""
echo "=== Post-loop verification: ${VERIFY_CMD} ==="
echo ""

if eval "$VERIFY_CMD"; then
  echo ""
  echo "PASS: Verification succeeded for ${SUBPHASE_ID}"
  echo "${SUBPHASE_ID}: PASS ($(date -Iseconds))" >> "${LOG_DIR}/results.txt"
else
  VERIFY_EXIT=$?
  echo ""
  echo "FAIL: Verification failed for ${SUBPHASE_ID} (exit code ${VERIFY_EXIT})"
  echo "${SUBPHASE_ID}: FAIL ($(date -Iseconds))" >> "${LOG_DIR}/results.txt"
  exit 1
fi
