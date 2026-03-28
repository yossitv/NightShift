// Night Shift MVP — Voice approval adapter (SPEC.md §14, context file)

import { REPO_CONFIG } from "./config";
import type { VoiceApprovalPayload, VoiceApprovalResult } from "./types";

export async function requestVoiceApproval(
  payload: VoiceApprovalPayload
): Promise<VoiceApprovalResult> {
  // Low-risk missions skip voice entirely
  if (payload.riskLevel !== "high") {
    return { mode: "print", status: "dry_run", callId: null };
  }

  // Attempt Bland AI call if credentials are available
  if (REPO_CONFIG.blandApiKey && payload.phoneNumber) {
    try {
      const res = await fetch("https://api.bland.ai/v1/calls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: REPO_CONFIG.blandApiKey,
        },
        body: JSON.stringify({
          phone_number: payload.phoneNumber,
          task: `You are Night Shift, an autonomous coding assistant. You need approval for a high-risk mission.
Issue: ${payload.issueTitle}.
Summary: ${payload.summary}.
Risk: ${payload.riskNote}.
Ask: Should I proceed with this mission? The user can approve, decline, or defer.`,
          voice: "mason",
          wait_for_greeting: true,
          webhook: payload.webhookUrl ?? null,
          metadata: {
            missionId: payload.missionId,
            issueNumber: payload.issueNumber,
          },
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as { call_id?: string };
        return {
          mode: "bland",
          status: "queued",
          callId: data.call_id ?? null,
        };
      }
    } catch (err) {
      console.error("Bland AI call failed, falling back to print trigger:", err);
    }
  }

  // Fallback: print structured trigger for manual handling
  console.log(
    JSON.stringify(
      {
        type: "VOICE_APPROVAL_TRIGGER",
        missionId: payload.missionId,
        issueNumber: payload.issueNumber,
        issueTitle: payload.issueTitle,
        riskLevel: payload.riskLevel,
        summary: payload.summary,
        riskNote: payload.riskNote,
        approvalUrl: `/api/missions/${payload.missionId}/approve`,
        declineUrl: `/api/missions/${payload.missionId}/decline`,
      },
      null,
      2
    )
  );

  return { mode: "print", status: "dry_run", callId: null };
}
