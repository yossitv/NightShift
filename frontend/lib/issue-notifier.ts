// Night Shift — Issue notification via voice call
// Decoupled from mission lifecycle: always calls for high-risk issues,
// regardless of whether an active mission exists.

import { REPO_CONFIG } from "./config";
import type { GitHubIssue, RiskLevel } from "./types";

export type PendingIssue = {
  issue: GitHubIssue;
  riskLevel: RiskLevel;
  riskNote: string;
  callId: string | null;
  decision: "pending" | "approved" | "declined" | "deferred";
  detectedAt: string;
};

// In-memory queue of issues that were called about but not yet turned into missions
const pendingQueue: PendingIssue[] = [];

export function getPendingQueue(): PendingIssue[] {
  return [...pendingQueue];
}

export function removePending(issueNumber: number) {
  const idx = pendingQueue.findIndex((p) => p.issue.number === issueNumber);
  if (idx >= 0) pendingQueue.splice(idx, 1);
}

export function updatePendingDecision(
  issueNumber: number,
  decision: "approved" | "declined" | "deferred"
) {
  const entry = pendingQueue.find((p) => p.issue.number === issueNumber);
  if (entry) entry.decision = decision;
}

/**
 * Call the operator about a high-risk issue. Does NOT create a mission.
 * Returns the call ID if a call was placed.
 */
export async function notifyHighRiskIssue(
  issue: GitHubIssue,
  riskNote: string
): Promise<string | null> {
  if (!REPO_CONFIG.blandApiKey || !REPO_CONFIG.phoneNumber) {
    console.log(`[Notifier] No Bland credentials — skipping call for issue #${issue.number}`);
    return null;
  }

  try {
    const blandPayload = {
      phone_number: REPO_CONFIG.phoneNumber,
      task: `You are Night Shift, an autonomous coding agent. You are calling the operator to notify them about a new high-risk issue that just came in. The issue is: ${issue.title}. ${riskNote.replace(/\\/g, "")}. Ask the operator if they approve this mission. Wait for their answer. Do NOT say "yes" or "approve" yourself — only the operator can approve. Just describe the issue and ask for their decision.`,
      voice: "mason",
      wait_for_greeting: true,
      max_duration: 60,
      metadata: {
        issueNumber: String(issue.number),
        type: "issue_notification",
      },
    };

    const res = await fetch("https://api.bland.ai/v1/calls", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: REPO_CONFIG.blandApiKey,
      },
      body: JSON.stringify(blandPayload),
    });

    const data = (await res.json()) as {
      call_id?: string;
      status?: string;
      message?: string;
    };

    if (res.ok && data.status !== "error" && data.call_id) {
      console.log(`[Notifier] Call placed for issue #${issue.number}: ${data.call_id}`);

      const entry: PendingIssue = {
        issue,
        riskLevel: "high",
        riskNote,
        callId: data.call_id,
        decision: "pending",
        detectedAt: new Date().toISOString(),
      };
      pendingQueue.push(entry);

      // Poll for result in background
      pollNotificationCall(data.call_id, issue.number).catch((err) => {
        console.error(`[Notifier] Poll error for issue #${issue.number}:`, err);
      });

      return data.call_id;
    }

    console.error("[Notifier] Bland API error:", data.status, data.message);
  } catch (err) {
    console.error("[Notifier] Call failed:", err);
  }

  return null;
}

/**
 * Poll a notification call for its result. Updates the pending queue entry.
 */
async function pollNotificationCall(callId: string, issueNumber: number) {
  const apiKey = REPO_CONFIG.blandApiKey;
  if (!apiKey) return;

  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 5000));

    const entry = pendingQueue.find((p) => p.issue.number === issueNumber);
    if (!entry || entry.decision !== "pending") return;

    try {
      const res = await fetch(`https://api.bland.ai/v1/calls/${callId}`, {
        headers: { authorization: apiKey },
      });
      if (!res.ok) continue;

      const data = (await res.json()) as {
        completed: boolean;
        concatenated_transcript?: string;
        call_length?: number;
      };

      if (!data.completed) continue;

      const rawTranscript = (data.concatenated_transcript ?? "").toLowerCase();
      const userLines = rawTranscript
        .split("\n")
        .filter((line) => line.trim().startsWith("user:"))
        .map((line) => line.replace(/^user:\s*/i, ""))
        .join(" ");

      let decision: "approved" | "declined" | "deferred" = "deferred";
      if (/\b(no|not approved|decline|reject|stop|cancel|declined|don't|do not)\b/.test(userLines)) {
        decision = "declined";
      } else if (/\b(yes|approve|proceed|go ahead|do it|approved)\b/.test(userLines)) {
        decision = "approved";
      }

      console.log(`[Notifier] Issue #${issueNumber} call completed. Decision: ${decision} (${data.call_length}s)`);

      if (entry) entry.decision = decision;
      return;
    } catch {
      // retry
    }
  }

  console.log(`[Notifier] Poll timeout for issue #${issueNumber}`);
}
