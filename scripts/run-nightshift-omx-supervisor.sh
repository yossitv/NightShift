#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

DURATION_SECONDS="${DURATION_SECONDS:-7200}"
SLEEP_BETWEEN_RUNS="${SLEEP_BETWEEN_RUNS:-15}"
MAX_RUNS="${MAX_RUNS:-9999}"
MODEL="${MODEL:-gpt-5.4}"
SANDBOX_MODE="${SANDBOX_MODE:-workspace-write}"
AUTO_MODE="${AUTO_MODE:-full-auto}"
BRANCH_PREFIX="${BRANCH_PREFIX:-codex/nightshift-mvp}"
LOG_DIR="${LOG_DIR:-${REPO_ROOT}/.omx/logs/nightshift-supervisor}"
CONTEXT_DIR="${CONTEXT_DIR:-${REPO_ROOT}/.omx/context}"
PROMPT_FILE="${PROMPT_FILE:-${CONTEXT_DIR}/nightshift-mvp-supervisor-prompt.md}"
CONTEXT_FILE="${CONTEXT_FILE:-}"

usage() {
  cat <<'EOF'
Usage:
  scripts/run-nightshift-omx-supervisor.sh

Environment overrides:
  DURATION_SECONDS=7200           Total supervisor runtime. Default: 7200
  SLEEP_BETWEEN_RUNS=15           Pause between omx exec runs. Default: 15
  MAX_RUNS=9999                   Hard cap on exec iterations. Default: 9999
  MODEL=gpt-5.4                   Codex model for omx exec
  SANDBOX_MODE=workspace-write    Sandbox for omx exec
  AUTO_MODE=full-auto             full-auto | dangerous
  BRANCH_PREFIX=codex/nightshift-mvp
  LOG_DIR=.omx/logs/nightshift-supervisor
  CONTEXT_DIR=.omx/context
  PROMPT_FILE=.omx/context/nightshift-mvp-supervisor-prompt.md
  CONTEXT_FILE=.omx/context/<existing>.md

Examples:
  DURATION_SECONDS=7200 scripts/run-nightshift-omx-supervisor.sh
  AUTO_MODE=dangerous MODEL=gpt-5.4 scripts/run-nightshift-omx-supervisor.sh
EOF
}

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

approval_args() {
  case "${AUTO_MODE}" in
    full-auto)
      printf '%s\n' "--full-auto"
      ;;
    dangerous)
      printf '%s\n' "--dangerously-bypass-approvals-and-sandbox"
      ;;
    *)
      printf 'unsupported AUTO_MODE: %s\n' "${AUTO_MODE}" >&2
      exit 1
      ;;
  esac
}

ensure_branch() {
  local current_branch
  current_branch="$(git -C "${REPO_ROOT}" rev-parse --abbrev-ref HEAD)"

  if [[ "${current_branch}" == "HEAD" ]]; then
    current_branch="detached"
  fi

  if [[ "${current_branch}" == "main" || "${current_branch}" == "master" || "${current_branch}" == "detached" ]]; then
    local branch_name
    branch_name="${BRANCH_PREFIX}-$(date '+%Y%m%d-%H%M%S')"
    git -C "${REPO_ROOT}" switch -c "${branch_name}" >/dev/null
    log "created working branch ${branch_name}"
  else
    log "using existing branch ${current_branch}"
  fi
}

create_context_file() {
  local timestamp
  timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
  CONTEXT_FILE="${CONTEXT_DIR}/nightshift-mvp-${timestamp}.md"

  cat > "${CONTEXT_FILE}" <<EOF
# Night Shift MVP Context Snapshot

## Task statement
Implement the Night Shift MVP described in ${REPO_ROOT}/SPEC.md.

## Desired outcome
Have a working reviewable MVP in this repository that follows the spec's build order, with runnable code, verification, and clear progress artifacts.

## Known facts/evidence
- The repository currently contains a product spec and OMX/Codex guidance.
- SPEC.md recommends Next.js for frontend/backend, plus SQLite or local JSON persistence for demo speed.
- The MVP flow is: GitHub issue intake -> mission planning -> runner execution -> checks -> bounded retry -> PR creation -> remote status page.

## Constraints
- Stay branch-only and PR-only; never target protected branches directly.
- Keep diffs reviewable and follow SPEC.md build order.
- Prefer the suggested MVP stack unless the repo state makes another narrow choice clearly safer.
- Verify with tests, lint, and/or typecheck whenever the implementation reaches runnable checkpoints.

## Unknowns/open questions
- Exact package manager and app structure are not set yet.
- GitHub credentials and external service availability may affect integration depth.

## Likely codebase touchpoints
- app/
- src/
- package.json
- mission store and API route files
- mission status UI
- runner/check orchestration files
EOF

  log "created context snapshot ${CONTEXT_FILE}"
}

ensure_context_file() {
  if [[ -n "${CONTEXT_FILE}" && -f "${CONTEXT_FILE}" ]]; then
    log "reusing context snapshot ${CONTEXT_FILE}"
    return
  fi

  if [[ -z "${CONTEXT_FILE}" ]]; then
    local latest_context
    latest_context="$(find "${CONTEXT_DIR}" -maxdepth 1 -type f -name 'nightshift-mvp-*.md' | sort | tail -n 1 || true)"
    if [[ -n "${latest_context}" ]]; then
      CONTEXT_FILE="${latest_context}"
      log "reusing latest context snapshot ${CONTEXT_FILE}"
      return
    fi
  fi

  create_context_file
}

write_prompt_file() {
  cat > "${PROMPT_FILE}" <<EOF
Continue implementing the Night Shift MVP in ${REPO_ROOT}.

First read:
- ${REPO_ROOT}/SPEC.md
- ${CONTEXT_FILE}

Execution rules:
- Do real implementation work. Do not stop at analysis or planning.
- Treat the spec's "Build Order" as the backlog priority unless the current repo state forces a narrower prerequisite.
- If the repo is still mostly empty, bootstrap the suggested MVP stack from the spec:
  - Next.js app for UI and API routes
  - local persistence suitable for demo speed
  - mission model, mission events, check results
  - mission creation API, mission status page, runner skeleton
- Keep the product intentionally narrow: one configured repo, one issue, one branch, one PR.
- Keep diffs small and reviewable.
- Reuse existing work instead of rewriting it.
- Run relevant verification before finishing each pass: tests, lint, typecheck, or the closest available equivalents.
- If blocked by missing credentials, network limits, or external services, implement the best local slice and leave concrete TODO markers/logged notes instead of stalling.

Priority sequence:
1. Mission model and local persistence
2. Mission creation API from GitHub issue URL
3. Mission status page
4. Runner skeleton with fake state transitions
5. Real repository checkout and branch creation
6. Codex CLI execution wrapper
7. Test and lint command integration
8. Retry loop
9. GitHub pull request creation
10. Tracing and requirement evaluation polish

At the end of this pass:
- summarize what changed
- report what was verified
- identify the next highest-priority unfinished item
EOF
}

print_summary() {
  local exit_code="$1"
  local run_id="$2"
  local last_message_file="$3"
  local status_file="$4"

  log "run ${run_id} exited with code ${exit_code}"
  if [[ -f "${status_file}" ]]; then
    log "git status snapshot:"
    sed -n '1,40p' "${status_file}"
  fi
  if [[ -f "${last_message_file}" ]]; then
    log "agent summary:"
    sed -n '1,80p' "${last_message_file}"
  fi
}

main() {
  if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    usage
    exit 0
  fi

  require_command omx
  require_command git

  mkdir -p "${LOG_DIR}" "${CONTEXT_DIR}"

  if ! git -C "${REPO_ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    printf 'repository root is not inside a git worktree: %s\n' "${REPO_ROOT}" >&2
    exit 1
  fi

  ensure_branch
  ensure_context_file
  write_prompt_file

  local deadline
  deadline="$(( $(date +%s) + DURATION_SECONDS ))"
  local run_id=1
  local approval_flag
  approval_flag="$(approval_args)"

  log "starting supervisor for ${DURATION_SECONDS}s"
  log "logs: ${LOG_DIR}"
  log "prompt: ${PROMPT_FILE}"

  while (( run_id <= MAX_RUNS )); do
    local now
    now="$(date +%s)"
    if (( now >= deadline )); then
      break
    fi

    local remaining
    remaining="$(( deadline - now ))"
    local stamp
    stamp="$(date '+%Y%m%dT%H%M%S%z')"
    local base
    base="${LOG_DIR}/run-$(printf '%03d' "${run_id}")-${stamp}"
    local json_log="${base}.jsonl"
    local text_log="${base}.log"
    local last_message_file="${base}-last-message.txt"
    local status_file="${base}-git-status.txt"
    local exit_code=0

    log "run ${run_id} starting, remaining ${remaining}s"
    git -C "${REPO_ROOT}" status --short > "${status_file}"

    set +e
    omx exec \
      "${approval_flag}" \
      --model "${MODEL}" \
      --sandbox "${SANDBOX_MODE}" \
      -C "${REPO_ROOT}" \
      --output-last-message "${last_message_file}" \
      --json \
      - < "${PROMPT_FILE}" > "${json_log}" 2> "${text_log}"
    exit_code="$?"
    set -e

    git -C "${REPO_ROOT}" status --short > "${status_file}"
    print_summary "${exit_code}" "${run_id}" "${last_message_file}" "${status_file}"

    if (( exit_code != 0 )); then
      log "run ${run_id} failed; see ${json_log} and ${text_log}"
    fi

    run_id="$(( run_id + 1 ))"
    now="$(date +%s)"
    if (( now >= deadline || run_id > MAX_RUNS )); then
      break
    fi

    sleep "${SLEEP_BETWEEN_RUNS}"
  done

  log "supervisor finished"
  log "final branch: $(git -C "${REPO_ROOT}" rev-parse --abbrev-ref HEAD)"
  log "final status:"
  git -C "${REPO_ROOT}" status --short
}

main "$@"
