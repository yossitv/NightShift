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
LOG_DIR="${LOG_DIR:-${REPO_ROOT}/.omx/logs/nightshift-supervisor}"
CONTEXT_DIR="${CONTEXT_DIR:-${REPO_ROOT}}"
PROMPT_FILE="${PROMPT_FILE:-${REPO_ROOT}/.omx/nightshift-mvp-supervisor-prompt.md}"
CONTEXT_FILE="${CONTEXT_FILE:-${REPO_ROOT}/context}"

usage() {
  cat <<'EOF'
Usage:
  scripts/run-nightshift-omx-supervisor.sh

Environment overrides:
  DURATION_SECONDS=7200           Total supervisor runtime. Default: 7200
  SLEEP_BETWEEN_RUNS=15           Pause between omx exec runs. Default: 15
  MAX_RUNS=9999                   Hard cap on exec iterations. Default: 9999
  RUN_TIMEOUT_SECONDS=900         Per-run omx exec timeout. Default: 900
  HEARTBEAT_INTERVAL_SECONDS=20   Progress heartbeat cadence. Default: 20
  TERMINATE_GRACE_SECONDS=10      Grace before SIGKILL after timeout. Default: 10
  MODEL=gpt-5.4                   Codex model for omx exec
  SANDBOX_MODE=workspace-write    Sandbox for omx exec
  AUTO_MODE=full-auto             full-auto | dangerous
  BRANCH_PREFIX=codex/nightshift-mvp
  LOG_DIR=.omx/logs/nightshift-supervisor
  CONTEXT_DIR=.
  PROMPT_FILE=.omx/nightshift-mvp-supervisor-prompt.md
  CONTEXT_FILE=./context

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

file_size_bytes() {
  local path="$1"
  if [[ ! -f "${path}" ]]; then
    printf '0\n'
    return
  fi

  wc -c < "${path}" | tr -d '[:space:]'
}

monitor_omx_exec() {
  local run_id="$1"
  local remaining_seconds="$2"
  local json_log="$3"
  local text_log="$4"
  local last_message_file="$5"
  local timeout_seconds="${RUN_TIMEOUT_SECONDS}"

  if (( timeout_seconds <= 0 || timeout_seconds > remaining_seconds )); then
    timeout_seconds="${remaining_seconds}"
  fi

  omx exec \
    "${approval_flag}" \
    --model "${MODEL}" \
    --sandbox "${SANDBOX_MODE}" \
    -C "${REPO_ROOT}" \
    --output-last-message "${last_message_file}" \
    --json \
    - < "${PROMPT_FILE}" > "${json_log}" 2> "${text_log}" &

  local omx_pid="$!"
  local started_at
  local next_heartbeat
  local timeout_at
  local now
  local last_size=0
  local last_change_at

  started_at="$(date +%s)"
  next_heartbeat="$(( started_at + HEARTBEAT_INTERVAL_SECONDS ))"
  timeout_at="$(( started_at + timeout_seconds ))"
  last_change_at="${started_at}"

  log "run ${run_id} omx exec pid ${omx_pid}, timeout ${timeout_seconds}s"

  while kill -0 "${omx_pid}" >/dev/null 2>&1; do
    sleep 1
    now="$(date +%s)"

    local current_size
    current_size="$(file_size_bytes "${json_log}")"
    if [[ "${current_size}" != "${last_size}" ]]; then
      last_size="${current_size}"
      last_change_at="${now}"
    fi

    if (( now >= next_heartbeat )); then
      log "run ${run_id} heartbeat: elapsed $(( now - started_at ))s, json ${current_size}B, idle $(( now - last_change_at ))s"
      next_heartbeat="$(( now + HEARTBEAT_INTERVAL_SECONDS ))"
    fi

    if (( now >= timeout_at )); then
      log "run ${run_id} reached timeout after ${timeout_seconds}s; sending SIGTERM to pid ${omx_pid}"
      kill "${omx_pid}" >/dev/null 2>&1 || true

      local grace_deadline="$(( now + TERMINATE_GRACE_SECONDS ))"
      while kill -0 "${omx_pid}" >/dev/null 2>&1 && (( $(date +%s) < grace_deadline )); do
        sleep 1
      done

      if kill -0 "${omx_pid}" >/dev/null 2>&1; then
        log "run ${run_id} did not exit after SIGTERM; sending SIGKILL to pid ${omx_pid}"
        kill -KILL "${omx_pid}" >/dev/null 2>&1 || true
      fi
    fi
  done

  local exit_code
  set +e
  wait "${omx_pid}"
  exit_code="$?"
  return "${exit_code}"
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
  cat > "${CONTEXT_FILE}" <<EOF
# Night Shift MVP Context Snapshot

## Mission
Implement the Night Shift MVP from ${REPO_ROOT}/SPEC.md with a DeepOps-style launch and approval path.

The specific requirement for this pass is:
- when a mission is launched, low-risk work may auto-start
- when a mission is high-risk, the system must initiate a phone approval flow before the runner starts
- if the real phone adapter is unavailable, emit a printable/manual trigger so the demo can continue without silent failure

## External reference to follow
Use the DeepOps reference implementation at https://github.com/ayushozha/deepops as the behavioral model for the approval path.

The important DeepOps patterns to copy are:
- a single "run once" entrypoint that processes one unit of work
- policy-based branching into auto-continue vs phone escalation
- a voice adapter that sends Bland AI calls only for high/critical work
- a webhook/manual decision path that turns the pending item into approved, declined, or revised work
- a safe fallback path that logs/prints the escalation trigger when the phone adapter is not fully configured

## Night Shift contract from SPEC.md
- canonical mission states:
  - candidate_selected
  - awaiting_approval
  - queued
  - planning
  - coding
  - testing
  - retrying
  - pr_opened
  - failed
  - canceled
  - declined
- voice approval is used only for high-risk missions
- do not call for low-risk missions
- do not start high-risk missions before approval
- log the approval request and result
- expose approval state on the status page
- support manual fallback approval in the UI if voice flow fails

## Approval implementation target
Mirror this DeepOps flow, renamed for Night Shift missions:

1. launch/select mission
2. compute risk
3. if low risk:
   - set approvalStatus=not_required
   - transition to queued
   - start runner
4. if high risk:
   - set approvalStatus=pending
   - transition to awaiting_approval
   - build a phone payload containing mission_id, issue title, summary, risk note, and target phone number
   - if Bland credentials are configured, call Bland
   - otherwise print a structured trigger payload and continue waiting for manual approval
5. webhook or manual approval endpoint updates the mission:
   - approved -> queued
   - declined -> declined
   - deferred -> awaiting_approval or deferred-equivalent UX state

## Required fallback behavior
The fallback path must be explicit and demo-friendly.

When the voice adapter cannot place a real call, print a structured payload like:

\`\`\`json
{
  "type": "VOICE_APPROVAL_TRIGGER",
  "missionId": "msn_123",
  "issueNumber": 42,
  "issueTitle": "Fix broken signup validation",
  "riskLevel": "high",
  "summary": "Patch signup validation and add regression coverage.",
  "riskNote": "Touches authentication path; approval required.",
  "targetPhoneNumberEnv": "BLAND_PHONE_NUMBER",
  "approvalUrl": "/api/missions/msn_123/approve",
  "declineUrl": "/api/missions/msn_123/decline"
}
\`\`\`

Use plain \`print\`, \`console.log\`, or server logging for this fallback trigger so it is visible in local demo output and logs.
Do not silently no-op.

## Implementation shape
Prefer a small adapter interface similar to:

\`\`\`ts
type VoiceApprovalPayload = {
  missionId: string;
  issueNumber: number;
  issueTitle: string;
  summary: string;
  riskLevel: "low" | "high";
  riskNote: string;
  phoneNumber: string | null;
  webhookUrl?: string | null;
};

type VoiceApprovalResult = {
  mode: "bland" | "print";
  status: "queued" | "dry_run" | "failed";
  callId: string | null;
};
\`\`\`

Desired behavior:

\`\`\`ts
async function requestVoiceApproval(payload: VoiceApprovalPayload): Promise<VoiceApprovalResult> {
  if (payload.riskLevel !== "high") {
    return { mode: "print", status: "dry_run", callId: null };
  }

  if (process.env.BLAND_API_KEY && payload.phoneNumber) {
    return await blandClient.call(payload);
  }

  console.log("VOICE_APPROVAL_TRIGGER", {
    missionId: payload.missionId,
    issueNumber: payload.issueNumber,
    issueTitle: payload.issueTitle,
    riskLevel: payload.riskLevel,
    summary: payload.summary,
    riskNote: payload.riskNote,
  });

  return { mode: "print", status: "dry_run", callId: null };
}
\`\`\`

## Expected touchpoints
- mission selection and risk scoring
- approval adapter / webhook route
- mission state persistence
- mission status UI
- runner start gate

## Constraints
- Stay branch-only and PR-only; never target protected branches directly.
- Keep diffs reviewable and follow SPEC.md build order.
- Prefer the suggested MVP stack unless the repo state makes another narrow choice clearly safer.
- Verify with tests, lint, and/or typecheck whenever the implementation reaches runnable checkpoints.
- Never block the whole mission on a missing external voice dependency if a print-based fallback can preserve the demo.
EOF

  log "created context snapshot ${CONTEXT_FILE}"
}

ensure_context_file() {
  if [[ -n "${CONTEXT_FILE}" && -f "${CONTEXT_FILE}" ]]; then
    log "reusing context snapshot ${CONTEXT_FILE}"
    return
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
    log "run ${run_id} output: ${json_log}"
    git -C "${REPO_ROOT}" status --short > "${status_file}"

    set +e
    monitor_omx_exec "${run_id}" "${remaining}" "${json_log}" "${text_log}" "${last_message_file}"
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
