#!/usr/bin/env bash

set -euo pipefail
shopt -s nullglob globstar

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
FRONTEND_DIR="${REPO_ROOT}/frontend"

MODEL="${MODEL:-gpt-5.4}"
SANDBOX_MODE="${SANDBOX_MODE:-workspace-write}"
AUTO_MODE="${AUTO_MODE:-full-auto}"
BRANCH_PREFIX="${BRANCH_PREFIX:-codex/nightshift-mvp}"
RUN_TIMEOUT_SECONDS="${RUN_TIMEOUT_SECONDS:-900}"
HEARTBEAT_INTERVAL_SECONDS="${HEARTBEAT_INTERVAL_SECONDS:-20}"
TERMINATE_GRACE_SECONDS="${TERMINATE_GRACE_SECONDS:-10}"
RUN_LABEL="${RUN_LABEL:-nightshift-main-$(date '+%Y%m%dT%H%M%S%z')}"
LOG_DIR="${LOG_DIR:-${REPO_ROOT}/.omx/logs/nightshift-main}"
CHECKPOINT_DIR="${CHECKPOINT_DIR:-${REPO_ROOT}/.omx/checkpoints/nightshift-main}"
CONTEXT_DIR="${CONTEXT_DIR:-${REPO_ROOT}/.omx/context}"

JSON_LOG="${JSON_LOG:-${LOG_DIR}/${RUN_LABEL}.jsonl}"
TEXT_LOG="${TEXT_LOG:-${LOG_DIR}/${RUN_LABEL}.log}"
LAST_MESSAGE_FILE="${LAST_MESSAGE_FILE:-${LOG_DIR}/${RUN_LABEL}-last-message.txt}"
STATUS_FILE="${STATUS_FILE:-${LOG_DIR}/${RUN_LABEL}-git-status.txt}"
PRE_STATUS_FILE="${PRE_STATUS_FILE:-${LOG_DIR}/${RUN_LABEL}-git-status-before.txt}"
POST_STATUS_FILE="${POST_STATUS_FILE:-${LOG_DIR}/${RUN_LABEL}-git-status-after.txt}"
PROMPT_FILE="${PROMPT_FILE:-${CONTEXT_DIR}/${RUN_LABEL}-prompt.md}"
CONTEXT_FILE="${CONTEXT_FILE:-${CONTEXT_DIR}/${RUN_LABEL}-context.md}"
RUN_STATE_FILE="${RUN_STATE_FILE:-${CHECKPOINT_DIR}/${RUN_LABEL}-state.env}"
RUN_SUMMARY_FILE="${RUN_SUMMARY_FILE:-${CHECKPOINT_DIR}/${RUN_LABEL}-summary.md}"
LATEST_STATE_FILE="${LATEST_STATE_FILE:-${CHECKPOINT_DIR}/latest-state.env}"
LATEST_SUMMARY_FILE="${LATEST_SUMMARY_FILE:-${CHECKPOINT_DIR}/latest-summary.md}"
PRECHECK_LINT_LOG="${PRECHECK_LINT_LOG:-${CHECKPOINT_DIR}/${RUN_LABEL}-preflight-lint.log}"
PRECHECK_BUILD_LOG="${PRECHECK_BUILD_LOG:-${CHECKPOINT_DIR}/${RUN_LABEL}-preflight-build.log}"
POSTCHECK_LINT_LOG="${POSTCHECK_LINT_LOG:-${CHECKPOINT_DIR}/${RUN_LABEL}-postflight-lint.log}"
POSTCHECK_BUILD_LOG="${POSTCHECK_BUILD_LOG:-${CHECKPOINT_DIR}/${RUN_LABEL}-postflight-build.log}"

PREVIOUS_FAILURE_CATEGORY="none"
PREVIOUS_OBJECTIVE="none"
PRECHECK_LINT_EXIT=999
PRECHECK_BUILD_EXIT=999
POSTCHECK_LINT_EXIT=999
POSTCHECK_BUILD_EXIT=999
CHECK_LINT_EXIT=999
CHECK_BUILD_EXIT=999
PRECHECK_NETWORK_BLOCKED="no"
declare -a SEARCH_PATHS=()

FRONTEND_BOOTSTRAPPED="no"
DEFAULT_TEMPLATE_REMAINS="unknown"
MISSION_MODEL_READY="no"
PERSISTENCE_READY="no"
API_READY="no"
SELECTION_READY="no"
STATUS_PAGE_READY="no"
UI_READY="no"
APPROVAL_READY="no"
RUNNER_READY="no"
REPO_EXEC_READY="no"
OMX_WRAPPER_READY="yes"
CHECKS_GREEN="no"
RETRY_LOOP_READY="no"
PR_READY="no"
TRACE_READY="no"
OVERALL_STATUS="needs_work"
CURRENT_OBJECTIVE="bootstrap_foundation"
LAST_FAILURE_CATEGORY="none"
STATUS_CHANGED="no"

usage() {
  cat <<'EOF'
Usage:
  scripts/omx-main-script.sh

Environment overrides:
  MODEL=gpt-5.4
  SANDBOX_MODE=workspace-write
  AUTO_MODE=full-auto
  RUN_TIMEOUT_SECONDS=900
  HEARTBEAT_INTERVAL_SECONDS=20
  TERMINATE_GRACE_SECONDS=10
  RUN_LABEL=nightshift-main-<timestamp>
  LOG_DIR=.omx/logs/nightshift-main
  CHECKPOINT_DIR=.omx/checkpoints/nightshift-main
  CONTEXT_DIR=.omx/context

Explicit artifact overrides:
  JSON_LOG=...
  TEXT_LOG=...
  LAST_MESSAGE_FILE=...
  STATUS_FILE=...
  PROMPT_FILE=...
  CONTEXT_FILE=...
  RUN_STATE_FILE=...
  RUN_SUMMARY_FILE=...
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

read_state_var() {
  local file="$1"
  local key="$2"
  if [[ ! -f "${file}" ]]; then
    return 1
  fi

  awk -F= -v key="${key}" '$1 == key { print substr($0, index($0, "=") + 1); exit }' "${file}"
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

capture_status_snapshot() {
  local target="$1"
  git -C "${REPO_ROOT}" status --short > "${target}"
  cp "${target}" "${STATUS_FILE}"
}

file_size_bytes() {
  local path="$1"
  if [[ ! -f "${path}" ]]; then
    printf '0\n'
    return
  fi

  wc -c < "${path}" | tr -d '[:space:]'
}

rg_has() {
  local pattern="$1"
  shift
  rg -q --glob '!**/node_modules/**' --glob '!**/.next/**' "${pattern}" "$@" 2>/dev/null
}

build_search_paths() {
  SEARCH_PATHS=("${FRONTEND_DIR}")

  local candidate
  for candidate in \
    "${SCRIPT_DIR}"/nightshift* \
    "${SCRIPT_DIR}"/mission* \
    "${SCRIPT_DIR}"/runner* \
    "${SCRIPT_DIR}"/approval*; do
    if [[ -e "${candidate}" ]]; then
      SEARCH_PATHS+=("${candidate}")
    fi
  done
}

has_route_files() {
  local route_dir="${FRONTEND_DIR}/app/api"
  if [[ ! -d "${route_dir}" ]]; then
    return 1
  fi

  local matches=("${route_dir}"/**/route.ts "${route_dir}"/**/route.js)
  (( ${#matches[@]} > 0 ))
}

has_status_page_files() {
  local matches=(
    "${FRONTEND_DIR}"/app/**/missions/**/page.tsx
    "${FRONTEND_DIR}"/app/**/missions/**/page.jsx
    "${FRONTEND_DIR}"/app/**/status/**/page.tsx
    "${FRONTEND_DIR}"/app/**/status/**/page.jsx
  )
  (( ${#matches[@]} > 0 ))
}

run_preflight_checks() {
  local phase="$1"
  local lint_log
  local build_log

  if [[ "${phase}" == "pre" ]]; then
    lint_log="${PRECHECK_LINT_LOG}"
    build_log="${PRECHECK_BUILD_LOG}"
  else
    lint_log="${POSTCHECK_LINT_LOG}"
    build_log="${POSTCHECK_BUILD_LOG}"
  fi

  if [[ ! -f "${FRONTEND_DIR}/package.json" ]]; then
    printf 'frontend/package.json is missing\n' > "${lint_log}"
    printf 'frontend/package.json is missing\n' > "${build_log}"
    if [[ "${phase}" == "pre" ]]; then
      PRECHECK_LINT_EXIT=999
      PRECHECK_BUILD_EXIT=999
    else
      POSTCHECK_LINT_EXIT=999
      POSTCHECK_BUILD_EXIT=999
    fi
    return
  fi

  local lint_exit
  local build_exit
  lint_exit=0
  build_exit=0

  set +e
  (
    cd "${FRONTEND_DIR}"
    npm run lint
  ) > "${lint_log}" 2>&1
  lint_exit="$?"
  (
    cd "${FRONTEND_DIR}"
    npm run build
  ) > "${build_log}" 2>&1
  build_exit="$?"
  set -e

  if [[ "${phase}" == "pre" ]]; then
    PRECHECK_LINT_EXIT="${lint_exit}"
    PRECHECK_BUILD_EXIT="${build_exit}"
  else
    POSTCHECK_LINT_EXIT="${lint_exit}"
    POSTCHECK_BUILD_EXIT="${build_exit}"
  fi

  if rg -q 'Could not resolve host|Failed to fetch|issue establishing a connection|failed to download' "${lint_log}" "${build_log}" 2>/dev/null; then
    PRECHECK_NETWORK_BLOCKED="yes"
  fi
}

detect_checkpoints() {
  FRONTEND_BOOTSTRAPPED="no"
  DEFAULT_TEMPLATE_REMAINS="unknown"
  MISSION_MODEL_READY="no"
  PERSISTENCE_READY="no"
  API_READY="no"
  SELECTION_READY="no"
  STATUS_PAGE_READY="no"
  UI_READY="no"
  APPROVAL_READY="no"
  RUNNER_READY="no"
  REPO_EXEC_READY="no"
  OMX_WRAPPER_READY="yes"
  CHECKS_GREEN="no"
  RETRY_LOOP_READY="no"
  PR_READY="no"
  TRACE_READY="no"

  if [[ -f "${FRONTEND_DIR}/package.json" && -f "${FRONTEND_DIR}/app/page.tsx" && -f "${FRONTEND_DIR}/tsconfig.json" ]]; then
    FRONTEND_BOOTSTRAPPED="yes"
  fi

  if [[ -f "${FRONTEND_DIR}/app/page.tsx" ]] && rg -q 'To get started, edit the page.tsx file\.' "${FRONTEND_DIR}/app/page.tsx"; then
    DEFAULT_TEMPLATE_REMAINS="yes"
  elif [[ -f "${FRONTEND_DIR}/app/page.tsx" ]]; then
    DEFAULT_TEMPLATE_REMAINS="no"
  fi

  local mission_type_found="no"
  local mission_event_found="no"
  local check_result_found="no"
  if rg_has '\b(type|interface) Mission\b' "${SEARCH_PATHS[@]}"; then
    mission_type_found="yes"
  fi
  if rg_has '\b(type|interface) MissionEvent\b' "${SEARCH_PATHS[@]}"; then
    mission_event_found="yes"
  fi
  if rg_has '\b(type|interface) CheckResult\b' "${SEARCH_PATHS[@]}"; then
    check_result_found="yes"
  fi
  if [[ "${mission_type_found}" == "yes" && "${mission_event_found}" == "yes" && "${check_result_found}" == "yes" ]]; then
    MISSION_MODEL_READY="yes"
  fi

  if rg_has 'sqlite|better-sqlite|MissionStore|missions\.json|saveMission|loadMission|persistMission|writeFile|readFile' "${SEARCH_PATHS[@]}"; then
    PERSISTENCE_READY="yes"
  fi

  if has_route_files; then
    API_READY="yes"
  fi

  if rg_has 'selectionReason|riskLevel|candidate_selected|issueNumber|issueTitle' "${SEARCH_PATHS[@]}"; then
    SELECTION_READY="yes"
  fi

  if has_status_page_files; then
    STATUS_PAGE_READY="yes"
  fi

  if [[ "${STATUS_PAGE_READY}" == "yes" && "${DEFAULT_TEMPLATE_REMAINS}" == "no" ]]; then
    UI_READY="yes"
  fi

  if rg_has 'VOICE_APPROVAL_TRIGGER|BLAND_API_KEY|approvalStatus|awaiting_approval|/approve|/decline' "${SEARCH_PATHS[@]}"; then
    APPROVAL_READY="yes"
  fi

  if rg_has '\bplanning\b|\bcoding\b|\btesting\b|\bretrying\b|retryCount|maxRetries|runner' "${SEARCH_PATHS[@]}"; then
    RUNNER_READY="yes"
  fi

  if rg_has 'git clone|git switch|branchName|repoOwner|repoName|working branch' "${SEARCH_PATHS[@]}"; then
    REPO_EXEC_READY="yes"
  fi

  if [[ -x "${SCRIPT_DIR}/omx-main-script.sh" ]]; then
    OMX_WRAPPER_READY="yes"
  fi

  if (( CHECK_LINT_EXIT == 0 && CHECK_BUILD_EXIT == 0 )); then
    CHECKS_GREEN="yes"
  fi

  if rg_has 'retryCount|maxRetries|retrying|repair pass' "${SEARCH_PATHS[@]}"; then
    RETRY_LOOP_READY="yes"
  fi

  if rg_has 'prUrl|pull request|gh pr|createPullRequest' "${SEARCH_PATHS[@]}"; then
    PR_READY="yes"
  fi

  if rg_has 'traceUrl|logUrl|acceptanceCriteria|requirements' "${SEARCH_PATHS[@]}"; then
    TRACE_READY="yes"
  fi
}

select_current_objective() {
  if [[ "${FRONTEND_BOOTSTRAPPED}" != "yes" ]]; then
    CURRENT_OBJECTIVE="bootstrap_foundation"
  elif [[ "${MISSION_MODEL_READY}" != "yes" || "${PERSISTENCE_READY}" != "yes" ]]; then
    CURRENT_OBJECTIVE="mission_model_and_persistence"
  elif [[ "${API_READY}" != "yes" ]]; then
    CURRENT_OBJECTIVE="issue_fetch_api"
  elif [[ "${SELECTION_READY}" != "yes" ]]; then
    CURRENT_OBJECTIVE="selection_and_risk"
  elif [[ "${UI_READY}" != "yes" ]]; then
    CURRENT_OBJECTIVE="status_page"
  elif [[ "${APPROVAL_READY}" != "yes" ]]; then
    CURRENT_OBJECTIVE="voice_approval"
  elif [[ "${RUNNER_READY}" != "yes" ]]; then
    CURRENT_OBJECTIVE="runner_skeleton"
  elif [[ "${REPO_EXEC_READY}" != "yes" ]]; then
    CURRENT_OBJECTIVE="repo_checkout_and_branching"
  elif [[ "${OMX_WRAPPER_READY}" != "yes" ]]; then
    CURRENT_OBJECTIVE="omx_execution_wrapper"
  elif [[ "${CHECKS_GREEN}" != "yes" ]]; then
    CURRENT_OBJECTIVE="checks_integration"
  elif [[ "${RETRY_LOOP_READY}" != "yes" ]]; then
    CURRENT_OBJECTIVE="retry_loop"
  elif [[ "${PR_READY}" != "yes" ]]; then
    CURRENT_OBJECTIVE="pull_request_output"
  elif [[ "${TRACE_READY}" != "yes" ]]; then
    CURRENT_OBJECTIVE="logs_and_requirement_polish"
  else
    CURRENT_OBJECTIVE="complete"
  fi

  if [[ "${CURRENT_OBJECTIVE}" == "complete" ]]; then
    OVERALL_STATUS="complete"
  else
    OVERALL_STATUS="needs_work"
  fi
}

objective_instruction() {
  case "${CURRENT_OBJECTIVE}" in
    bootstrap_foundation)
      cat <<'EOF'
- The repository is missing a usable app scaffold. Bootstrap the MVP foundation first.
- Create the minimum Next.js project structure under frontend/ and keep it runnable without adding unnecessary dependencies.
- End the run with frontend/package.json, frontend/app, and working lint/build commands.
EOF
      ;;
    mission_model_and_persistence)
      cat <<'EOF'
- Implement concrete Mission, MissionEvent, and CheckResult model code, not spec-only text.
- Add demo-safe local persistence for missions and events so later API and UI work can read/write real data.
- Keep the storage deterministic and local-file or sqlite based; do not depend on remote services.
EOF
      ;;
    issue_fetch_api)
      cat <<'EOF'
- Implement the next missing API routes, starting with GET /api/issues.
- If live GitHub credentials are unavailable, use a local/demo-safe adapter with explicit TODOs rather than blocking.
- Keep the API contract aligned with SPEC.md.
EOF
      ;;
    selection_and_risk)
      cat <<'EOF'
- Implement automatic candidate selection and risk scoring on top of the issue API.
- Persist selectionReason, riskLevel, and the initial mission status transition.
- Do not leave selection logic as comments or placeholders only.
EOF
      ;;
    status_page)
      cat <<'EOF'
- Replace the default create-next-app landing page with a real mission candidate/status UI.
- The page must expose issue title, selection rationale, risk level, approval status, mission state, retry count, branch, checks, and PR URL placeholders or real values.
- Keep it mobile-friendly and avoid generic template chrome.
EOF
      ;;
    voice_approval)
      cat <<'EOF'
- Implement the approval gate and manual fallback path.
- High-risk missions must wait in awaiting_approval and emit a visible VOICE_APPROVAL_TRIGGER when live calling is unavailable.
- Add approval/decline endpoints or equivalent server actions needed for the demo flow.
EOF
      ;;
    runner_skeleton)
      cat <<'EOF'
- Implement the script-based runner skeleton with visible state transitions through planning, coding, testing, and retrying.
- Record mission events so the status page can show progress without opening the terminal.
- Use fake/demo-safe transitions when the full repo execution path is not ready yet.
EOF
      ;;
    repo_checkout_and_branching)
      cat <<'EOF'
- Implement the bounded repository execution path: clone or reuse the configured repo, create a mission branch, and preserve branch-only safety.
- Never target main directly.
- Keep the implementation narrow to one configured repo.
EOF
      ;;
    omx_execution_wrapper)
      cat <<'EOF'
- Implement the OMX/Codex execution wrapper needed to launch autonomous coding from the mission runner.
- Keep it non-interactive and artifact-driven.
- Reuse the unattended scripting path already present in this repository.
EOF
      ;;
    checks_integration)
      cat <<'EOF'
- Integrate lint/build/test checks into the mission flow and persist the results.
- The status page should be able to surface at least one real check result.
- Use the existing frontend commands where possible.
EOF
      ;;
    retry_loop)
      cat <<'EOF'
- Implement a bounded retry loop that captures failure output and retries with context.
- Retry state must be visible in mission data and mission events.
- Cap retries and fail visibly when the limit is exceeded.
EOF
      ;;
    pull_request_output)
      cat <<'EOF'
- Implement the PR output step: commit on the mission branch, push, and create or simulate a PR URL.
- Persist prUrl in mission state.
- If network or credentials prevent live PR creation, keep the local slice moving and leave a concrete adapter seam.
EOF
      ;;
    logs_and_requirement_polish)
      cat <<'EOF'
- Polish logs, trace links, and requirement evaluation so the mission page can explain success or failure remotely.
- Keep the output aligned with the spec's acceptance criteria and evaluation section.
- Prefer deletion and consolidation over adding extra framework.
EOF
      ;;
    *)
      cat <<'EOF'
- All tracked checkpoints are currently satisfied.
- If you find a small gap that blocks demo readiness, close it and verify.
EOF
      ;;
  esac
}

objective_starting_files() {
  case "${CURRENT_OBJECTIVE}" in
    mission_model_and_persistence)
      cat <<'EOF'
- frontend/app/page.tsx
- frontend/app/layout.tsx
- frontend/src/lib/nightshift/types.ts
- frontend/src/lib/nightshift/store.ts
EOF
      ;;
    issue_fetch_api)
      cat <<'EOF'
- frontend/src/lib/nightshift/store.ts
- frontend/app/api/issues/route.ts
- frontend/app/api/missions/select/route.ts
EOF
      ;;
    selection_and_risk)
      cat <<'EOF'
- frontend/app/api/missions/select/route.ts
- frontend/src/lib/nightshift/select.ts
- frontend/src/lib/nightshift/store.ts
EOF
      ;;
    status_page)
      cat <<'EOF'
- frontend/app/page.tsx
- frontend/app/missions/[missionId]/page.tsx
- frontend/src/lib/nightshift/store.ts
EOF
      ;;
    voice_approval)
      cat <<'EOF'
- frontend/src/lib/nightshift/approval.ts
- frontend/app/api/missions/[missionId]/approve/route.ts
- frontend/app/api/missions/[missionId]/decline/route.ts
EOF
      ;;
    runner_skeleton)
      cat <<'EOF'
- frontend/src/lib/nightshift/runner.ts
- frontend/src/lib/nightshift/store.ts
- frontend/app/api/missions/[missionId]/start/route.ts
EOF
      ;;
    *)
      cat <<'EOF'
- frontend/app/page.tsx
- frontend/src/lib/nightshift/
EOF
      ;;
  esac
}

failure_guidance() {
  case "${PREVIOUS_FAILURE_CATEGORY}" in
    interactive_tool_attempt)
      cat <<'EOF'
- Last run attempted a tool path that required open stdin after launch.
- Do not use TTY sessions, REPLs, watch modes, pagers, or any command that would need follow-up input.
- Use one-shot shell commands only.
EOF
      ;;
    network_unavailable)
      cat <<'EOF'
- Last run hit a network-resolution failure.
- Do not install packages, fetch remote code, or rely on live network access in this pass.
- Work only with files and dependencies already present in the repository.
EOF
      ;;
    no_files_created)
      cat <<'EOF'
- Last run did not change repository files.
- This pass must end with concrete code edits unless the targeted checkpoint is already complete.
- Do not spend the whole pass exploring.
EOF
      ;;
    missing_last_message)
      cat <<'EOF'
- Last run did not produce a final summary artifact.
- End this pass with a normal final response that states changed files, verification, and the next checkpoint.
EOF
      ;;
    run_timeout)
      cat <<'EOF'
- Last run timed out.
- Choose a narrow slice that can be implemented and verified inside the current timeout budget.
EOF
      ;;
  esac
}

write_context_file() {
  cat > "${CONTEXT_FILE}" <<EOF
# Night Shift OMX Main Context

## Run
- run_label: ${RUN_LABEL}
- previous_failure: ${PREVIOUS_FAILURE_CATEGORY}
- previous_objective: ${PREVIOUS_OBJECTIVE}
- preflight_network_blocked: ${PRECHECK_NETWORK_BLOCKED}

## Machine-evaluated checkpoints
- bootstrapped: ${FRONTEND_BOOTSTRAPPED}
- api_ready: ${API_READY}
- selection_ready: ${SELECTION_READY}
- ui_ready: ${UI_READY}
- approval_ready: ${APPROVAL_READY}
- runner_ready: ${RUNNER_READY}
- repo_exec_ready: ${REPO_EXEC_READY}
- checks_green: ${CHECKS_GREEN}
- preflight_network_blocked: ${PRECHECK_NETWORK_BLOCKED}
- retry_loop_ready: ${RETRY_LOOP_READY}
- pr_ready: ${PR_READY}
- trace_ready: ${TRACE_READY}
- default_template_remains: ${DEFAULT_TEMPLATE_REMAINS}

## Current objective
${CURRENT_OBJECTIVE}

## Verification baseline
- frontend lint exit: ${PRECHECK_LINT_EXIT}
- frontend build exit: ${PRECHECK_BUILD_EXIT}

## Artifact paths
- spec: ${REPO_ROOT}/SPEC.md
- context: ${REPO_ROOT}/context
- run_summary: ${RUN_SUMMARY_FILE}
- json_log: ${JSON_LOG}
- text_log: ${TEXT_LOG}

## Notes
- frontend/ already exists in this repo when bootstrapped=yes; do not recreate it.
- This script runs unattended. Prefer deterministic local implementation over exploration.
- Use the spec's build order and acceptance criteria as the source of truth.
EOF
}

write_prompt_file() {
  cat > "${PROMPT_FILE}" <<EOF
Continue implementing the Night Shift MVP in ${REPO_ROOT}.

Read first:
- ${REPO_ROOT}/SPEC.md
- ${REPO_ROOT}/context
- ${CONTEXT_FILE}

This run is fully unattended.
- Do not ask the user for clarification, confirmation, or permission.
- Make reasonable assumptions and proceed.
- Do not stop at analysis or planning; do real implementation work.
- Keep diffs small, reviewable, and reversible.
- Reuse existing files and patterns instead of recreating the scaffold.
- If external services or credentials are missing, implement the best local slice and leave a concrete adapter seam rather than stalling.
- Run verification before finishing the pass.
- If current preflight checks hit network failures, remove or avoid the network-dependent local path instead of retrying it unchanged.

Non-interactive execution rules:
- Never rely on open stdin after launch.
- Avoid TTY-only or follow-up-input commands.
- Use one-shot shell commands only.
- Ignore these paths unless there is a concrete edit reason: .git, .omx, frontend/.next, frontend/node_modules.
- Do not dump large directory trees or enumerate generated files.
- Do not spend the run listing the repository; inspect only the files needed for the current objective.
- Within the first 6 shell commands, either edit a file or create a new source file for the current objective.
- If you have not edited a file yet, stop exploring and start implementing immediately.

Current machine objective: ${CURRENT_OBJECTIVE}

Objective-specific guidance:
$(objective_instruction)

Suggested starting files:
$(objective_starting_files)

Failure-recovery guidance:
$(failure_guidance)

Current environment guidance:
- preflight_network_blocked=${PRECHECK_NETWORK_BLOCKED}

Checkpoint snapshot:
- bootstrapped=${FRONTEND_BOOTSTRAPPED}
- mission_model_ready=${MISSION_MODEL_READY}
- persistence_ready=${PERSISTENCE_READY}
- api_ready=${API_READY}
- selection_ready=${SELECTION_READY}
- ui_ready=${UI_READY}
- approval_ready=${APPROVAL_READY}
- runner_ready=${RUNNER_READY}
- repo_exec_ready=${REPO_EXEC_READY}
- checks_green=${CHECKS_GREEN}
- retry_loop_ready=${RETRY_LOOP_READY}
- pr_ready=${PR_READY}
- trace_ready=${TRACE_READY}
- default_template_remains=${DEFAULT_TEMPLATE_REMAINS}

Implementation target for this run:
- Advance the current objective with concrete file edits.
- Prefer the spec's build order, but do not regress a completed checkpoint.
- If the current objective is partially complete, finish it before starting later stages.
- For mission_model_and_persistence specifically, create concrete source files for the Mission, MissionEvent, and CheckResult data model plus deterministic local persistence before doing any more broad repo inspection.

At the end of this pass:
- summarize what changed
- report what you verified
- identify the next highest-priority unfinished checkpoint
EOF
}

monitor_omx_exec() {
  local approval_flag="$1"

  omx exec \
    "${approval_flag}" \
    --model "${MODEL}" \
    --sandbox "${SANDBOX_MODE}" \
    -C "${REPO_ROOT}" \
    --output-last-message "${LAST_MESSAGE_FILE}" \
    --json \
    - < "${PROMPT_FILE}" > "${JSON_LOG}" 2> "${TEXT_LOG}" &

  local omx_pid="$!"
  local started_at
  local next_heartbeat
  local timeout_at
  local now
  local last_size=0
  local last_change_at

  started_at="$(date +%s)"
  next_heartbeat="$(( started_at + HEARTBEAT_INTERVAL_SECONDS ))"
  timeout_at="$(( started_at + RUN_TIMEOUT_SECONDS ))"
  last_change_at="${started_at}"

  log "omx exec pid ${omx_pid}, timeout ${RUN_TIMEOUT_SECONDS}s"

  while kill -0 "${omx_pid}" >/dev/null 2>&1; do
    sleep 1
    now="$(date +%s)"

    local current_size
    current_size="$(file_size_bytes "${JSON_LOG}")"
    if [[ "${current_size}" != "${last_size}" ]]; then
      last_size="${current_size}"
      last_change_at="${now}"
    fi

    if (( now >= next_heartbeat )); then
      log "heartbeat: elapsed $(( now - started_at ))s, json ${current_size}B, idle $(( now - last_change_at ))s"
      next_heartbeat="$(( now + HEARTBEAT_INTERVAL_SECONDS ))"
    fi

    if (( now >= timeout_at )); then
      log "run timed out after ${RUN_TIMEOUT_SECONDS}s; sending SIGTERM to pid ${omx_pid}"
      kill "${omx_pid}" >/dev/null 2>&1 || true

      local grace_deadline="$(( now + TERMINATE_GRACE_SECONDS ))"
      while kill -0 "${omx_pid}" >/dev/null 2>&1 && (( $(date +%s) < grace_deadline )); do
        sleep 1
      done

      if kill -0 "${omx_pid}" >/dev/null 2>&1; then
        log "process survived SIGTERM; sending SIGKILL to pid ${omx_pid}"
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

classify_failure() {
  local exit_code="$1"

  if rg -q 'stdin is closed|tty=true|write_stdin failed' "${TEXT_LOG}" "${JSON_LOG}" 2>/dev/null; then
    LAST_FAILURE_CATEGORY="interactive_tool_attempt"
  elif rg -q 'Could not resolve host|failed to download|download of .* failed|network.*failed|Couldn'\''t resolve host' "${TEXT_LOG}" "${JSON_LOG}" 2>/dev/null; then
    LAST_FAILURE_CATEGORY="network_unavailable"
  elif (( exit_code == 143 || exit_code == 137 || exit_code == 124 )); then
    LAST_FAILURE_CATEGORY="run_timeout"
  elif (( exit_code != 0 )); then
    LAST_FAILURE_CATEGORY="agent_failure"
  elif [[ ! -s "${LAST_MESSAGE_FILE}" ]]; then
    LAST_FAILURE_CATEGORY="missing_last_message"
  elif [[ "${CURRENT_OBJECTIVE}" != "complete" && "${STATUS_CHANGED}" != "yes" ]]; then
    LAST_FAILURE_CATEGORY="no_files_created"
  else
    LAST_FAILURE_CATEGORY="none"
  fi
}

write_state_file() {
  cat > "${RUN_STATE_FILE}" <<EOF
RUN_LABEL=${RUN_LABEL}
OVERALL_STATUS=${OVERALL_STATUS}
CURRENT_OBJECTIVE=${CURRENT_OBJECTIVE}
PREVIOUS_FAILURE_CATEGORY=${PREVIOUS_FAILURE_CATEGORY}
PREVIOUS_OBJECTIVE=${PREVIOUS_OBJECTIVE}
LAST_FAILURE_CATEGORY=${LAST_FAILURE_CATEGORY}
STATUS_CHANGED=${STATUS_CHANGED}
FRONTEND_BOOTSTRAPPED=${FRONTEND_BOOTSTRAPPED}
DEFAULT_TEMPLATE_REMAINS=${DEFAULT_TEMPLATE_REMAINS}
MISSION_MODEL_READY=${MISSION_MODEL_READY}
PERSISTENCE_READY=${PERSISTENCE_READY}
API_READY=${API_READY}
SELECTION_READY=${SELECTION_READY}
STATUS_PAGE_READY=${STATUS_PAGE_READY}
UI_READY=${UI_READY}
APPROVAL_READY=${APPROVAL_READY}
RUNNER_READY=${RUNNER_READY}
REPO_EXEC_READY=${REPO_EXEC_READY}
OMX_WRAPPER_READY=${OMX_WRAPPER_READY}
CHECKS_GREEN=${CHECKS_GREEN}
RETRY_LOOP_READY=${RETRY_LOOP_READY}
PR_READY=${PR_READY}
TRACE_READY=${TRACE_READY}
PRECHECK_LINT_EXIT=${PRECHECK_LINT_EXIT}
PRECHECK_BUILD_EXIT=${PRECHECK_BUILD_EXIT}
POSTCHECK_LINT_EXIT=${POSTCHECK_LINT_EXIT}
POSTCHECK_BUILD_EXIT=${POSTCHECK_BUILD_EXIT}
PRECHECK_NETWORK_BLOCKED=${PRECHECK_NETWORK_BLOCKED}
JSON_LOG=${JSON_LOG}
TEXT_LOG=${TEXT_LOG}
LAST_MESSAGE_FILE=${LAST_MESSAGE_FILE}
STATUS_FILE=${STATUS_FILE}
PROMPT_FILE=${PROMPT_FILE}
CONTEXT_FILE=${CONTEXT_FILE}
RUN_SUMMARY_FILE=${RUN_SUMMARY_FILE}
EOF

  cp "${RUN_STATE_FILE}" "${LATEST_STATE_FILE}"
}

write_summary_file() {
  cat > "${RUN_SUMMARY_FILE}" <<EOF
# Night Shift OMX Run Summary

- run_label: ${RUN_LABEL}
- overall_status: ${OVERALL_STATUS}
- current_objective: ${CURRENT_OBJECTIVE}
- previous_failure: ${PREVIOUS_FAILURE_CATEGORY}
- last_failure: ${LAST_FAILURE_CATEGORY}
- status_changed: ${STATUS_CHANGED}

## Checkpoints
- bootstrapped: ${FRONTEND_BOOTSTRAPPED}
- mission_model_ready: ${MISSION_MODEL_READY}
- persistence_ready: ${PERSISTENCE_READY}
- api_ready: ${API_READY}
- selection_ready: ${SELECTION_READY}
- status_page_ready: ${STATUS_PAGE_READY}
- ui_ready: ${UI_READY}
- approval_ready: ${APPROVAL_READY}
- runner_ready: ${RUNNER_READY}
- repo_exec_ready: ${REPO_EXEC_READY}
- checks_green: ${CHECKS_GREEN}
- retry_loop_ready: ${RETRY_LOOP_READY}
- pr_ready: ${PR_READY}
- trace_ready: ${TRACE_READY}
- default_template_remains: ${DEFAULT_TEMPLATE_REMAINS}

## Verification
- preflight lint exit: ${PRECHECK_LINT_EXIT}
- preflight build exit: ${PRECHECK_BUILD_EXIT}
- postflight lint exit: ${POSTCHECK_LINT_EXIT}
- postflight build exit: ${POSTCHECK_BUILD_EXIT}

## Artifacts
- prompt: ${PROMPT_FILE}
- context: ${CONTEXT_FILE}
- json_log: ${JSON_LOG}
- text_log: ${TEXT_LOG}
- last_message: ${LAST_MESSAGE_FILE}
- status: ${STATUS_FILE}
EOF

  cp "${RUN_SUMMARY_FILE}" "${LATEST_SUMMARY_FILE}"
}

result_exit_code() {
  case "${LAST_FAILURE_CATEGORY}" in
    none)
      printf '0\n'
      ;;
    interactive_tool_attempt)
      printf '21\n'
      ;;
    network_unavailable)
      printf '22\n'
      ;;
    run_timeout)
      printf '23\n'
      ;;
    no_files_created)
      printf '24\n'
      ;;
    missing_last_message)
      printf '25\n'
      ;;
    agent_failure)
      printf '26\n'
      ;;
    *)
      printf '27\n'
      ;;
  esac
}

main() {
  if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    usage
    exit 0
  fi

  require_command omx
  require_command git
  require_command npm

  mkdir -p "${LOG_DIR}" "${CHECKPOINT_DIR}" "${CONTEXT_DIR}"

  if ! git -C "${REPO_ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    printf 'repository root is not inside a git worktree: %s\n' "${REPO_ROOT}" >&2
    exit 1
  fi

  ensure_branch

  PREVIOUS_FAILURE_CATEGORY="$(read_state_var "${LATEST_STATE_FILE}" "LAST_FAILURE_CATEGORY" || true)"
  PREVIOUS_OBJECTIVE="$(read_state_var "${LATEST_STATE_FILE}" "CURRENT_OBJECTIVE" || true)"
  PREVIOUS_FAILURE_CATEGORY="${PREVIOUS_FAILURE_CATEGORY:-none}"
  PREVIOUS_OBJECTIVE="${PREVIOUS_OBJECTIVE:-none}"

  build_search_paths
  capture_status_snapshot "${PRE_STATUS_FILE}"

  run_preflight_checks "pre"
  CHECK_LINT_EXIT="${PRECHECK_LINT_EXIT}"
  CHECK_BUILD_EXIT="${PRECHECK_BUILD_EXIT}"
  detect_checkpoints
  select_current_objective
  write_context_file
  write_prompt_file

  log "run_label: ${RUN_LABEL}"
  log "current objective: ${CURRENT_OBJECTIVE}"
  log "checkpoint summary: bootstrapped=${FRONTEND_BOOTSTRAPPED} api=${API_READY} ui=${UI_READY} approval=${APPROVAL_READY} runner=${RUNNER_READY} checks=${CHECKS_GREEN}"
  log "prompt: ${PROMPT_FILE}"

  if [[ "${CURRENT_OBJECTIVE}" == "complete" ]]; then
    LAST_FAILURE_CATEGORY="none"
    POSTCHECK_LINT_EXIT="${PRECHECK_LINT_EXIT}"
    POSTCHECK_BUILD_EXIT="${PRECHECK_BUILD_EXIT}"
    write_state_file
    write_summary_file
    log "all tracked checkpoints are already complete; skipping omx exec"
    exit 0
  fi

  local approval_flag
  approval_flag="$(approval_args)"

  local run_exit_code
  set +e
  monitor_omx_exec "${approval_flag}"
  run_exit_code="$?"
  set -e

  capture_status_snapshot "${POST_STATUS_FILE}"
  if ! cmp -s "${PRE_STATUS_FILE}" "${POST_STATUS_FILE}"; then
    STATUS_CHANGED="yes"
  fi

  if [[ "${STATUS_CHANGED}" == "yes" ]]; then
    run_preflight_checks "post"
    CHECK_LINT_EXIT="${POSTCHECK_LINT_EXIT}"
    CHECK_BUILD_EXIT="${POSTCHECK_BUILD_EXIT}"
  else
    POSTCHECK_LINT_EXIT="${PRECHECK_LINT_EXIT}"
    POSTCHECK_BUILD_EXIT="${PRECHECK_BUILD_EXIT}"
    CHECK_LINT_EXIT="${PRECHECK_LINT_EXIT}"
    CHECK_BUILD_EXIT="${PRECHECK_BUILD_EXIT}"
  fi

  detect_checkpoints
  select_current_objective
  classify_failure "${run_exit_code}"
  write_state_file
  write_summary_file

  log "run exited with code ${run_exit_code}"
  log "post objective: ${CURRENT_OBJECTIVE}"
  log "failure category: ${LAST_FAILURE_CATEGORY}"
  if [[ -f "${LAST_MESSAGE_FILE}" ]]; then
    log "agent summary:"
    sed -n '1,80p' "${LAST_MESSAGE_FILE}"
  fi

  exit "$(result_exit_code)"
}

main "$@"
