# Night Shift Spec

## 1. Product Summary

Night Shift is a Codex-powered autonomous development service for one preconfigured GitHub repository.

The system monitors or fetches open issues, selects one issue to work on, evaluates its risk, requests voice approval for high-risk work, and then runs an autonomous implementation loop that aims to return one review-ready pull request.

The MVP is intentionally narrow:

- one configured repository
- one active mission at a time
- one selected issue
- one working branch
- one pull request result

Night Shift is not a general autonomous IDE.
It is a narrow autonomous issue-to-PR system with observable progress and explicit safety gates.

## 2. Hackathon Positioning

For the hackathon, Night Shift should present as a Codex-powered service that can:

1. inspect repository issues
2. choose a bounded issue automatically
3. request approval by phone if the task looks important or risky
4. run autonomously once approved
5. expose progress remotely
6. end in a reviewable PR

The winning demo is not "look at our script."
The winning demo is:

1. Night Shift chooses an issue
2. Night Shift explains the mission
3. a phone call arrives for approval when needed
4. the mission runs autonomously
5. the status page shows logs and state transitions
6. a pull request appears

The shell runner is an implementation detail of the MVP.
The product is the full observable workflow.

## 3. Problem

Developers often have many open issues but not enough time to choose, supervise, and implement small tasks one by one.

Coding agents are powerful, but they still feel fragile because:

- they need constant steering
- they do not always choose the right task
- their work is hard to observe remotely
- risky work needs a clear approval gate
- the result is not always packaged as a reviewable pull request

Night Shift solves this by combining:

- automatic issue selection
- explicit risk scoring
- voice approval for risky work
- a bounded autonomous runner
- a remote-readable mission status page

## 4. Goals

### Product Goals

- Let the system choose one issue from one configured repository.
- Generate a scoped mission with summary, acceptance criteria, and risk level.
- Require explicit approval for high-risk missions before coding starts.
- Run a bounded coding workflow through a dedicated runner.
- Produce a pull request, not a direct merge.
- Show progress, logs, and current state on a mobile-friendly status page.
- Preserve an audit trail of what happened and why.

### Demo Goals

- A judge can understand the product in under 3 minutes.
- The demo shows real autonomous behavior, not slides.
- The issue selection is automatic and legible.
- The phone approval flow is visible and meaningful.
- The autonomous phase is visible without opening the coding terminal.
- Success means PR opened.
- Failure is legible and explainable.

## 5. Non-Goals

These are explicitly out of scope for MVP:

- multiple repositories
- multiple simultaneous missions
- generalized repo onboarding
- arbitrary issue triage across many repos
- multi-user auth
- browser-based code editing
- deployment to production
- automatic merge to main
- a full workflow engine for arbitrary tasks
- a generalized chat interface

## 6. Primary User

The primary user is a developer or founder with one configured repository who wants Night Shift to choose a promising issue and either:

- run it automatically when it is safe, or
- ask for approval when it is risky

Example issue shapes:

- "Fix broken signup validation and add regression coverage."
- "Add dark mode toggle and persist preference."
- "Add recent activity card to dashboard."

## 7. Product Principle

Night Shift should feel:

- trustworthy
- narrow
- autonomous
- observable
- review-oriented

If a choice must be made between "more magic" and "more understandable," prefer "more understandable" for MVP.

## 8. Core User Experience

### 8.1 Mission Flow

1. User opens Night Shift.
2. Night Shift fetches open issues for the configured repository.
3. Night Shift selects one issue candidate.
4. Night Shift generates:
   - mission summary
   - acceptance criteria
   - non-goals
   - risk level
5. If risk is low, mission starts automatically.
6. If risk is high, Night Shift calls the user for approval.
7. After approval, the runner starts.
8. The user watches progress on the mission status page.
9. If checks pass, Night Shift opens a pull request.

### 8.2 Issue Selection UX

The repository is fixed in the MVP.

The system should automatically select from open issues in the configured repository.

The UI should show:

- selected issue title
- why it was selected
- why it was considered low-risk or high-risk

Optional operator controls:

- `Select Another Issue`
- `Skip`
- `Start Anyway`

These are fallback controls, not the primary path.

### 8.3 Voice Approval UX

Voice approval is used only for high-risk or important missions.

The phone call should clearly communicate:

- selected issue title
- short summary of intended work
- why approval is required
- simple approval options

Example:

- approve mission
- decline mission
- defer mission

The MVP may use Bland AI for this flow.

### 8.4 Status Page UX

The mission page must show:

- selected issue
- selection rationale
- risk level
- approval status
- current mission state
- latest action
- retry count
- checks summary
- branch name
- PR URL when available
- recent logs and/or trace link

## 9. Demo Narrative

The demo should follow this exact story:

1. Night Shift loads open issues for the configured repository.
2. Night Shift automatically selects one issue.
3. The UI shows why it selected that issue.
4. The system evaluates risk.
5. If high-risk, the user receives a voice approval call.
6. Once approved, the mission enters planning and coding.
7. The status page shows state transitions and logs.
8. The system opens a pull request, or visibly fails with a reason.

The status page is not optional in the MVP.
It is the proof that the run can be observed remotely without touching the coding terminal.

## 10. Mission Lifecycle

Canonical mission states:

- `candidate_selected`
- `awaiting_approval`
- `queued`
- `planning`
- `coding`
- `testing`
- `retrying`
- `pr_opened`
- `failed`
- `canceled`
- `declined`

### Transition Rules

- `candidate_selected -> queued` when risk is low
- `candidate_selected -> awaiting_approval` when risk is high
- `awaiting_approval -> queued` when approval is granted
- `awaiting_approval -> declined` when approval is denied
- `queued -> planning` when mission starts
- `planning -> coding` when mission plan is written
- `coding -> testing` when implementation pass completes
- `testing -> pr_opened` when required checks pass and PR creation succeeds
- `testing -> retrying` when checks fail and retry budget remains
- `retrying -> coding` when the next repair pass begins
- `retrying -> failed` when retry budget is exhausted
- `any -> canceled` when stopped by operator

## 11. MVP Architecture

The MVP has five main parts:

1. `Web UI`
   - mission candidate view
   - approval state view
   - mission status page

2. `API Server`
   - issue fetch
   - candidate selection
   - mission creation
   - mission reads
   - event reads
   - approval and webhook handling

3. `Mission Store`
   - stores missions, events, check results, approval state, and runner artifacts

4. `Runner`
   - script-based autonomous runner for the MVP
   - orchestrates planning, coding, testing, retrying, and PR creation

5. `Voice Approval Adapter`
   - sends phone approval request
   - receives approval webhook
   - updates mission approval status

### Why a Script-Based Runner

For MVP, the runner should be a script-based worker rather than a full queue or orchestration platform.

That choice is correct for the demo because it is:

- fast to build
- easy to reason about
- easy to log
- easy to replace later

The script is the official `Runner` implementation in MVP, not a throwaway hack.

## 12. Suggested MVP Stack

Suggested stack for fast delivery:

- frontend: Next.js
- backend: Next.js route handlers
- persistence: SQLite or local JSON-backed persistence
- GitHub integration: GitHub REST API
- runner engine: shell script + Codex / OMX invocation
- voice approval: Bland AI
- tracing: internal event logs first, optional external tracing second

## 13. Automatic Issue Selection Contract

Night Shift must choose from open issues in the configured repository.

### Inputs

- configured repository owner/name
- current open issues
- optional labels or filters

### Outputs

- selected issue
- selection rationale
- risk level
- mission summary draft

### Selection Rules

The selector should prefer issues that are:

- bounded
- specific
- likely implementable in one mission
- unlikely to require major architectural work

The selector should avoid issues that are:

- too large
- too ambiguous
- obviously multi-step or multi-PR
- blocked on outside dependencies

### Risk Rules

The selector must classify the candidate as:

- `low`
- `high`

Low-risk missions may auto-start.
High-risk missions require approval before execution.

## 14. Voice Approval Contract

The voice approval system is used for high-risk missions only.

### Inputs

- mission id
- issue title
- mission summary
- risk note
- target phone number

### Outputs

- approval request event
- approval state
- webhook result
- approval timestamp

### Approval Decisions

- `approved`
- `declined`
- `deferred`

### Behavioral Rules

- do not call for low-risk missions
- do not start high-risk missions before approval
- log the approval request and result
- expose approval state on the status page
- support manual fallback approval in the UI if voice flow fails

## 15. Runner Contract

The MVP runner is a script-based autonomous worker.
It should be treated as a product component with a stable contract.

### Inputs

- mission id
- repository path or repository config
- `repoOwner`
- `repoName`
- `issueNumber`
- canonical `issueUrl`
- max retries
- branch prefix

### Outputs

- mission state updates
- mission events
- check results
- branch name
- PR URL
- last error
- log artifact paths

### Behavioral Rules

- solve only the selected issue
- do not expand scope
- keep diffs small and reviewable
- avoid direct writes to protected branches
- run checks before declaring success
- if checks fail, retry with failure context
- stop after configured retry limit
- emit structured events throughout execution

### Required Runner Events

- planning started
- plan written
- coding started
- file changes completed
- checks started
- check passed
- check failed
- retry started
- commit created
- branch pushed
- PR opened
- mission failed

## 16. Functional Requirements

### 16.1 Configured Repository

The MVP supports one preconfigured repository.

The system must:

- know the repository owner and name
- reject unsupported repositories
- avoid operating on any other repository

### 16.2 Issue Fetching

The system must:

- fetch open issues for the configured repository
- exclude unsupported or obviously unfit issues when possible
- show the selected issue and rationale in the UI

### 16.3 Candidate Selection

The system must:

- select one issue candidate automatically
- store the selection rationale
- store the risk level
- create a mission record from that issue

### 16.4 Mission Planning

Before coding starts, the system must generate:

- one-paragraph mission summary
- acceptance criteria
- explicit non-goals
- risk note

This output must be written into the mission record.

### 16.5 Approval Gate

If risk is high, the system must:

- create an approval request
- trigger the voice approval adapter
- wait for approval before execution
- visibly show the waiting state

### 16.6 Repository Execution

The runner must:

- create or reuse a local clone of the configured repository
- create a mission branch
- execute the coding agent workflow
- record major steps as mission events
- never write directly to `main`

### 16.7 Checks

The MVP requires three gates:

- tests pass
- lint and/or typecheck pass
- issue requirements appear satisfied

The first two are command-based checks.
The third is an LLM-based judgment against the acceptance criteria.

### 16.8 Bounded Retry Loop

If checks fail, the runner must:

- capture failure output
- append a retry event
- re-run the coding workflow with failure context
- stop after a configurable retry limit

### 16.9 Pull Request Output

If checks pass, the runner must:

- commit changes on the mission branch
- push the branch
- open a pull request
- generate PR title and body from the mission
- store the PR URL in the mission record

### 16.10 Remote Status Page

The mission page must show:

- issue title
- selection rationale
- risk level
- approval status
- repository name
- current mission state
- mission summary
- acceptance criteria
- latest event
- checks summary
- retry count
- branch name
- PR URL if available
- recent logs or trace link if available

The page must be mobile-friendly and must not require horizontal scrolling.

## 17. Non-Functional Requirements

- The product must remain understandable in a short live demo.
- State transitions must be inspectable after the run.
- Failure must be visible, not silent.
- The system must preserve enough data to explain selection, approval, success, or failure.
- The system must default to branch-only and PR-only safety rails.

## 18. Data Model

### 18.1 Mission

```ts
type Mission = {
  id: string;
  repoOwner: string;
  repoName: string;
  issueNumber: number;
  issueUrl: string;
  issueTitle: string;
  issueBody: string;
  selectionReason: string | null;
  riskLevel: "low" | "high";
  approvalStatus: "not_required" | "pending" | "approved" | "declined" | "deferred";
  status:
    | "candidate_selected"
    | "awaiting_approval"
    | "queued"
    | "planning"
    | "coding"
    | "testing"
    | "retrying"
    | "pr_opened"
    | "failed"
    | "canceled"
    | "declined";
  summary: string | null;
  acceptanceCriteria: string[];
  nonGoals: string[];
  branchName: string | null;
  prUrl: string | null;
  traceUrl: string | null;
  logUrl: string | null;
  retryCount: number;
  maxRetries: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};
```

### 18.2 Mission Event

```ts
type MissionEvent = {
  id: string;
  missionId: string;
  type: string;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};
```

### 18.3 Check Result

```ts
type CheckResult = {
  missionId: string;
  name: "tests" | "lint" | "requirements";
  status: "pending" | "passed" | "failed";
  summary: string;
  rawOutput: string | null;
  createdAt: string;
};
```

## 19. API Contract

### `GET /api/issues`

Returns open issues for the configured repository.

### `POST /api/missions/select`

Automatically selects one issue candidate and creates a mission in `candidate_selected`.

Response:

```json
{
  "missionId": "msn_123",
  "issueNumber": 42,
  "riskLevel": "high",
  "status": "awaiting_approval"
}
```

### `GET /api/missions/:missionId`

Returns mission details and latest check summary.

### `GET /api/missions/:missionId/events`

Returns mission events in chronological order.

### `POST /api/missions/:missionId/approve`

Manual approval fallback endpoint.

### `POST /api/missions/:missionId/decline`

Declines the mission.

### `POST /api/missions/:missionId/start`

Starts the script-based runner when approval requirements are satisfied.

### `POST /api/webhooks/bland`

Receives voice approval callback updates.

## 20. Evaluation

Night Shift needs a minimal but credible evaluation system.

### Required Evaluations

1. `tests`
   - did the configured test command pass

2. `lint`
   - did lint and/or typecheck pass

3. `requirements`
   - did the final diff appear to satisfy the issue acceptance criteria

### Optional Evaluations

- selection quality score
- risk score
- demo-readiness score

## 21. Safety Rules

- only operate on explicitly configured repositories
- never write directly to protected branches
- do not store secrets in logs or status views
- cap retries
- cap run duration
- require approval before high-risk execution
- expose a cancel action

## 22. Demo Acceptance Criteria

The MVP demo is successful if:

1. The system fetches open issues for the configured repository.
2. The system automatically selects one issue and explains why.
3. The system classifies the mission as low-risk or high-risk.
4. A high-risk mission visibly waits for voice approval.
5. After approval, the mission visibly transitions through planning, coding, and testing.
6. At least one check result is shown.
7. The system opens a pull request or visibly fails with a reason.
8. The user can inspect what happened from the status page without opening the coding terminal.

## 23. Build Order

Recommended implementation order:

1. Mission model and local persistence
2. Open issue fetch API
3. Automatic issue selection and risk scoring
4. Mission candidate view and status page
5. Voice approval adapter and webhook handling
6. Script-based runner skeleton with fake state transitions
7. Real repository checkout and branch creation
8. Codex / OMX execution wrapper
9. Test and lint integration
10. Retry loop
11. GitHub pull request creation
12. Logs, trace links, and requirement evaluation polish

## 24. Future Work

Future versions may add:

- multiple repositories
- scheduled nightly runs
- label-based selection policies
- richer issue ranking
- richer approval policies
- multiple approval channels
- queueing and scheduling
- reusable mission templates
- automatic merge after approval
