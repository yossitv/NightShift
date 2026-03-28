// Night Shift MVP — Shared types used by lib/ modules
// The canonical Mission type lives in src/lib/nightshift/types.ts

export type RiskLevel = "low" | "high";

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
