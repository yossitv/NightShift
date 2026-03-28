#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

DURATION_SECONDS="${DURATION_SECONDS:-7200}"
SLEEP_BETWEEN_RUNS="${SLEEP_BETWEEN_RUNS:-15}"
MAX_RUNS="${MAX_RUNS:-9999}"
RUN_TIMEOUT_SECONDS="${RUN_TIMEOUT_SECONDS:-900}"
HEARTBEAT_INTERVAL_SECONDS="${HEARTBEAT_INTERVAL_SECONDS:-20}"
TERMINATE_GRACE_SECONDS="${TERMINATE_GRACE_SECONDS:-10}"
MODEL="${MODEL:-gpt-5.4}"
SANDBOX_MODE="${SANDBOX_MODE:-workspace-write}"
AUTO_MODE="${AUTO_MODE:-full-auto}"
BRANCH_PREFIX="${BRANCH_PREFIX:-codex/nightshift-mvp}"
MAIN_SCRIPT="${MAIN_SCRIPT:-${SCRIPT_DIR}/omx-main-script.sh}"
LOG_DIR="${LOG_DIR:-${REPO_ROOT}/.omx/logs/nightshift-supervisor}"
CHECKPOINT_DIR="${CHECKPOINT_DIR:-${REPO_ROOT}/.omx/checkpoints/nightshift-main}"
LATEST_STATE_FILE="${LATEST_STATE_FILE:-${CHECKPOINT_DIR}/latest-state.env}"

usage() {
  cat <<'EOF'
Usage:
  scripts/run-nightshift-omx-supervisor.sh

Environment overrides:
  DURATION_SECONDS=7200
  SLEEP_BETWEEN_RUNS=15
  MAX_RUNS=9999
  RUN_TIMEOUT_SECONDS=900
  HEARTBEAT_INTERVAL_SECONDS=20
  TERMINATE_GRACE_SECONDS=10
  MODEL=gpt-5.4
  SANDBOX_MODE=workspace-write
  AUTO_MODE=full-auto
  BRANCH_PREFIX=codex/nightshift-mvp
  MAIN_SCRIPT=scripts/omx-main-script.sh
  LOG_DIR=.omx/logs/nightshift-supervisor
  CHECKPOINT_DIR=.omx/checkpoints/nightshift-main
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

read_state_var() {
  local file="$1"
  local key="$2"
  if [[ ! -f "${file}" ]]; then
    return 1
  fi

  awk -F= -v key="${key}" '$1 == key { print substr($0, index($0, "=") + 1); exit }' "${file}"
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

  require_command git
  require_command bash

  if [[ ! -x "${MAIN_SCRIPT}" ]]; then
    printf 'main script is missing or not executable: %s\n' "${MAIN_SCRIPT}" >&2
    exit 1
  fi

  mkdir -p "${LOG_DIR}" "${CHECKPOINT_DIR}"

  if ! git -C "${REPO_ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    printf 'repository root is not inside a git worktree: %s\n' "${REPO_ROOT}" >&2
    exit 1
  fi

  ensure_branch

  local deadline
  deadline="$(( $(date +%s) + DURATION_SECONDS ))"
  local run_id=1

  log "starting supervisor for ${DURATION_SECONDS}s"
  log "logs: ${LOG_DIR}"
  log "main script: ${MAIN_SCRIPT}"

  while (( run_id <= MAX_RUNS )); do
    local now
    now="$(date +%s)"
    if (( now >= deadline )); then
      break
    fi

    local remaining
    remaining="$(( deadline - now ))"
    local run_timeout="${RUN_TIMEOUT_SECONDS}"
    if (( run_timeout <= 0 || run_timeout > remaining )); then
      run_timeout="${remaining}"
    fi

    local stamp
    stamp="$(date '+%Y%m%dT%H%M%S%z')"
    local label
    label="run-$(printf '%03d' "${run_id}")-${stamp}"
    local base
    base="${LOG_DIR}/${label}"
    local json_log="${base}.jsonl"
    local text_log="${base}.log"
    local last_message_file="${base}-last-message.txt"
    local status_file="${base}-git-status.txt"
    local exit_code=0

    log "run ${run_id} starting, remaining ${remaining}s"
    log "run ${run_id} output: ${json_log}"

    set +e
    RUN_LABEL="${label}" \
    MODEL="${MODEL}" \
    SANDBOX_MODE="${SANDBOX_MODE}" \
    AUTO_MODE="${AUTO_MODE}" \
    BRANCH_PREFIX="${BRANCH_PREFIX}" \
    RUN_TIMEOUT_SECONDS="${run_timeout}" \
    HEARTBEAT_INTERVAL_SECONDS="${HEARTBEAT_INTERVAL_SECONDS}" \
    TERMINATE_GRACE_SECONDS="${TERMINATE_GRACE_SECONDS}" \
    JSON_LOG="${json_log}" \
    TEXT_LOG="${text_log}" \
    LAST_MESSAGE_FILE="${last_message_file}" \
    STATUS_FILE="${status_file}" \
    LOG_DIR="${LOG_DIR}" \
    CHECKPOINT_DIR="${CHECKPOINT_DIR}" \
    "${MAIN_SCRIPT}"
    exit_code="$?"
    set -e

    print_summary "${exit_code}" "${run_id}" "${last_message_file}" "${status_file}"

    if [[ -f "${LATEST_STATE_FILE}" ]]; then
      local overall_status
      overall_status="$(read_state_var "${LATEST_STATE_FILE}" "OVERALL_STATUS" || true)"
      local last_failure
      last_failure="$(read_state_var "${LATEST_STATE_FILE}" "LAST_FAILURE_CATEGORY" || true)"
      log "latest state: overall_status=${overall_status:-unknown} failure=${last_failure:-unknown}"
      if [[ "${overall_status:-}" == "complete" ]]; then
        log "completion detected in checkpoint state; stopping supervisor"
        break
      fi
    fi

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
