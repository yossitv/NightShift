// Night Shift MVP — Voice approval adapter (SPEC.md §14, context file)

import { REPO_CONFIG } from "./config";
import { pollBlandCall } from "./bland-poll";
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
      const blandPayload = {
          phone_number: payload.phoneNumber,
          task: `You are Night Shift. A high-risk mission needs your approval: ${payload.issueTitle}. ${payload.riskNote.replace(/\\/g, '')}. Do you approve? Say yes or no.`,
          voice: "mason",
          wait_for_greeting: true,
          max_duration: 60,
          ...(payload.webhookUrl && !payload.webhookUrl.includes("localhost") ? { webhook: payload.webhookUrl } : {}),
          metadata: {
            missionId: payload.missionId,
            issueNumber: String(payload.issueNumber),
          },
        };
      console.log("Bland API payload:", JSON.stringify(blandPayload, null, 2));

      const res = await fetch("https://api.bland.ai/v1/calls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: REPO_CONFIG.blandApiKey,
        },
        body: JSON.stringify(blandPayload),
      });

      const data = (await res.json()) as { call_id?: string; status?: string; message?: string };

      if (res.ok && data.status !== "error" && data.call_id) {
        console.log("Bland AI call queued:", data.call_id);

        // Start polling for result (webhook won't reach localhost)
        pollBlandCall(data.call_id, payload.missionId).catch((err) => {
          console.error("Bland poll error:", err);
        });

        return {
          mode: "bland",
          status: "queued",
          callId: data.call_id,
        };
      }

      // API returned an error (rate limit, invalid number, etc.)
      console.error("Bland AI response:", data.status, data.message ?? "unknown error");
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
