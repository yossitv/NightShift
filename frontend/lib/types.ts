// Night Shift MVP — Core data model (SPEC.md §18)

export type RiskLevel = "low" | "high";

export type ApprovalStatus =
  | "not_required"
  | "pending"
  | "approved"
  | "declined"
  | "deferred";

export type MissionStatus =
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

export type Mission = {
  id: string;
  repoOwner: string;
  repoName: string;
  issueNumber: number;
  issueUrl: string;
  issueTitle: string;
  issueBody: string;
  selectionReason: string | null;
  riskLevel: RiskLevel;
  approvalStatus: ApprovalStatus;
  status: MissionStatus;
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

export type MissionEvent = {
  id: string;
  missionId: string;
  type: string;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type CheckResult = {
  missionId: string;
  name: "tests" | "lint" | "requirements";
  status: "pending" | "passed" | "failed";
  summary: string;
  rawOutput: string | null;
  createdAt: string;
};

// GitHub issue shape used by the selector
export type GitHubIssue = {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  labels: { name: string }[];
  created_at: string;
  updated_at: string;
  pull_request?: unknown;
};

// Voice approval types (from context file)
export type VoiceApprovalPayload = {
  missionId: string;
  issueNumber: number;
  issueTitle: string;
  summary: string;
  riskLevel: RiskLevel;
  riskNote: string;
  phoneNumber: string | null;
  webhookUrl?: string | null;
};

export type VoiceApprovalResult = {
  mode: "bland" | "print";
  status: "queued" | "dry_run" | "failed";
  callId: string | null;
};
