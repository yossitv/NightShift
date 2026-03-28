// Night Shift — Bland AI call result poller
// When webhook is not reachable (localhost), poll the call status instead.

import { REPO_CONFIG } from "./config";
import {
  getMission,
  updateMissionState,
  appendMissionEvent,
} from "@/src/lib/nightshift/store";
import { runMission } from "./runner-core";

/**
 * Poll a Bland AI call until it completes, then update mission state.
 */
export async function pollBlandCall(callId: string, missionId: string) {
  const apiKey = REPO_CONFIG.blandApiKey;
  if (!apiKey) return;

  const maxAttempts = 30; // 30 * 5s = 2.5 minutes max
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 5000));

    // Check if mission is still awaiting_approval
    const mission = await getMission(missionId);
    if (!mission || mission.state !== "awaiting_approval") return;

    try {
      const res = await fetch(`https://api.bland.ai/v1/calls/${callId}`, {
        headers: { authorization: apiKey },
      });
      if (!res.ok) continue;

      const data = (await res.json()) as {
        status: string;
        completed: boolean;
        concatenated_transcript?: string;
        call_length?: number;
      };

      if (!data.completed) continue;

      // Call completed — parse transcript for decision
      const transcript = (data.concatenated_transcript ?? "").toLowerCase();
      let decision: "approved" | "declined" | "deferred" = "deferred";

      if (/\b(yes|approve|proceed|go ahead|do it|approved)\b/.test(transcript)) {
        decision = "approved";
      } else if (/\b(no|decline|reject|stop|cancel|declined)\b/.test(transcript)) {
        decision = "declined";
      }

      console.log(`Bland call ${callId} completed. Decision: ${decision}. Duration: ${data.call_length}s`);
      console.log(`Transcript: ${transcript.slice(0, 300)}`);

      if (decision === "approved") {
        await updateMissionState(missionId, "queued", "Mission approved via voice call.");
        await appendMissionEvent(missionId, {
          actor: "approval_adapter",
          type: "approval_resolved",
          state: "queued",
          message: `Approved via voice call (${data.call_length}s). Auto-starting runner.`,
          metadata: { callId, transcript: transcript.slice(0, 200) },
        });

        // Auto-start the runner after approval
        runMission(missionId).catch((err) => {
          console.error("Auto-start after approval failed:", err);
        });
      } else if (decision === "declined") {
        await updateMissionState(missionId, "declined", "Mission declined via voice call.");
        await appendMissionEvent(missionId, {
          actor: "approval_adapter",
          type: "approval_resolved",
          state: "declined",
          message: `Declined via voice call (${data.call_length}s).`,
          metadata: { callId, transcript: transcript.slice(0, 200) },
        });
      } else {
        await appendMissionEvent(missionId, {
          actor: "approval_adapter",
          type: "note_logged",
          state: "awaiting_approval",
          message: `Voice call completed but no clear decision. Manual approval required.`,
          metadata: { callId, transcript: transcript.slice(0, 200) },
        });
      }

      return;
    } catch {
      // Network error, retry
    }
  }

  console.log(`Bland poll timeout for call ${callId}`);
}
