export const MISSION_STATES = [
  "candidate_selected",
  "awaiting_approval",
  "queued",
  "planning",
  "coding",
  "testing",
  "retrying",
  "pr_opened",
  "failed",
  "canceled",
  "declined",
] as const;

export type MissionState = (typeof MISSION_STATES)[number];

export const RISK_LEVELS = ["low", "high"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const APPROVAL_STATUSES = ["not_required", "pending", "approved", "declined"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const CHECK_STATUSES = ["pending", "running", "passed", "failed", "skipped"] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];

export const MISSION_EVENT_TYPES = [
  "mission_created",
  "state_changed",
  "approval_requested",
  "approval_resolved",
  "check_updated",
  "note_logged",
  "planning_started",
  "plan_written",
  "coding_started",
  "checks_started",
  "check_passed",
  "check_failed",
  "retry_started",
  "commit_created",
  "branch_pushed",
  "pr_opened",
  "mission_failed",
] as const;
export type MissionEventType = (typeof MISSION_EVENT_TYPES)[number];

export type MissionActor = "system" | "operator" | "runner" | "approval_adapter";
export type MissionApprovalChannel = "auto" | "voice" | "manual";
export type MissionEventMetadata = Record<string, string | number | boolean | null | undefined>;

export interface MissionIssueRef {
  owner: string;
  repo: string;
  number: number;
  title: string;
  url?: string | null;
}

export interface MissionSelection {
  rationale: string;
  whyNow: string;
  riskNote: string;
}

export interface MissionApproval {
  status: ApprovalStatus;
  requestedAt: string | null;
  resolvedAt: string | null;
  channel: MissionApprovalChannel;
  phoneNumber: string | null;
}

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  summary: string;
  startedAt: string | null;
  completedAt: string | null;
  detailsUrl?: string | null;
}

export interface MissionBranch {
  name: string | null;
  pullRequestUrl: string | null;
}

export interface Mission {
  id: string;
  createdAt: string;
  updatedAt: string;
  state: MissionState;
  summary: string;
  acceptanceCriteria: string[];
  nonGoals: string[];
  riskLevel: RiskLevel;
  issue: MissionIssueRef;
  selection: MissionSelection;
  approval: MissionApproval;
  latestAction: string;
  retryCount: number;
  branch: MissionBranch;
  checks: CheckResult[];
}

export interface MissionEvent {
  id: string;
  missionId: string;
  createdAt: string;
  actor: MissionActor;
  type: MissionEventType;
  state: MissionState;
  message: string;
  metadata?: MissionEventMetadata;
}

export interface MissionStoreSnapshot {
  missions: Mission[];
  events: MissionEvent[];
}

export interface CreateMissionInput {
  issue: MissionIssueRef;
  summary: string;
  acceptanceCriteria: string[];
  nonGoals?: string[];
  riskLevel: RiskLevel;
  selection: MissionSelection;
  latestAction?: string;
  retryCount?: number;
  checks?: CheckResult[];
  branchName?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function pickEnumValue<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  return typeof value === "string" && allowed.includes(value) ? value : fallback;
}

export function normalizeCheckResult(value: unknown): CheckResult {
  const source = isRecord(value) ? value : {};

  return {
    id: asString(source.id, "check_unknown"),
    label: asString(source.label, "Unnamed check"),
    status: pickEnumValue(source.status, CHECK_STATUSES, "pending"),
    summary: asString(source.summary, ""),
    startedAt: asNullableString(source.startedAt),
    completedAt: asNullableString(source.completedAt),
    detailsUrl: asNullableString(source.detailsUrl),
  };
}

export function normalizeMissionEvent(value: unknown): MissionEvent {
  const source = isRecord(value) ? value : {};
  const metadata = isRecord(source.metadata) ? source.metadata : undefined;

  return {
    id: asString(source.id, "evt_unknown"),
    missionId: asString(source.missionId),
    createdAt: asString(source.createdAt, new Date(0).toISOString()),
    actor:
      source.actor === "operator" ||
      source.actor === "runner" ||
      source.actor === "approval_adapter"
        ? source.actor
        : "system",
    type: pickEnumValue(source.type, MISSION_EVENT_TYPES, "note_logged"),
    state: pickEnumValue(source.state, MISSION_STATES, "candidate_selected"),
    message: asString(source.message),
    metadata: metadata as MissionEventMetadata | undefined,
  };
}

export function normalizeMission(value: unknown): Mission {
  const source = isRecord(value) ? value : {};
  const issue = isRecord(source.issue) ? source.issue : {};
  const selection = isRecord(source.selection) ? source.selection : {};
  const approval = isRecord(source.approval) ? source.approval : {};
  const branch = isRecord(source.branch) ? source.branch : {};

  return {
    id: asString(source.id, "msn_unknown"),
    createdAt: asString(source.createdAt, new Date(0).toISOString()),
    updatedAt: asString(source.updatedAt, asString(source.createdAt, new Date(0).toISOString())),
    state: pickEnumValue(source.state, MISSION_STATES, "candidate_selected"),
    summary: asString(source.summary),
    acceptanceCriteria: asStringArray(source.acceptanceCriteria),
    nonGoals: asStringArray(source.nonGoals),
    riskLevel: pickEnumValue(source.riskLevel, RISK_LEVELS, "low"),
    issue: {
      owner: asString(issue.owner),
      repo: asString(issue.repo),
      number: asNumber(issue.number),
      title: asString(issue.title),
      url: asNullableString(issue.url),
    },
    selection: {
      rationale: asString(selection.rationale),
      whyNow: asString(selection.whyNow),
      riskNote: asString(selection.riskNote),
    },
    approval: {
      status: pickEnumValue(approval.status, APPROVAL_STATUSES, "not_required"),
      requestedAt: asNullableString(approval.requestedAt),
      resolvedAt: asNullableString(approval.resolvedAt),
      channel:
        approval.channel === "voice" || approval.channel === "manual"
          ? approval.channel
          : "auto",
      phoneNumber: asNullableString(approval.phoneNumber),
    },
    latestAction: asString(source.latestAction),
    retryCount: asNumber(source.retryCount),
    branch: {
      name: asNullableString(branch.name),
      pullRequestUrl: asNullableString(branch.pullRequestUrl),
    },
    checks: Array.isArray(source.checks) ? source.checks.map(normalizeCheckResult) : [],
  };
}

export function normalizeMissionStoreSnapshot(value: unknown): MissionStoreSnapshot {
  const source = isRecord(value) ? value : {};

  return {
    missions: Array.isArray(source.missions) ? source.missions.map(normalizeMission) : [],
    events: Array.isArray(source.events) ? source.events.map(normalizeMissionEvent) : [],
  };
}
