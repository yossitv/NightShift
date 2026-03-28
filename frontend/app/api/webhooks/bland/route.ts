// POST /api/webhooks/bland — Bland AI voice approval callback (SPEC.md §14, §19)

import { getMission, updateMissionState, appendMissionEvent } from "@/src/lib/nightshift/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json();
  const missionId = body?.metadata?.missionId as string | undefined;

  if (!missionId) {
    return Response.json({ error: "Missing missionId in metadata" }, { status: 400 });
  }

  const mission = await getMission(missionId);
  if (!mission) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }

  if (mission.state !== "awaiting_approval") {
    return Response.json({ ok: true, message: "Mission no longer awaiting approval" });
  }

  // Parse Bland AI transcript for approval/decline/defer keywords
  // Only analyze USER's lines — the AI assistant may say "approve" in its prompt
  const rawTranscript = (body?.concatenated_transcript ?? body?.transcript ?? "").toLowerCase();
  const userLines = rawTranscript
    .split("\n")
    .filter((line: string) => line.trim().startsWith("user:"))
    .map((line: string) => line.replace(/^user:\s*/i, ""))
    .join(" ");
  let decision: "approved" | "declined" | "deferred" = "deferred";

  // Check decline first — explicit rejection takes priority
  if (/\b(no|not approved|decline|reject|stop|cancel|declined|don't|do not)\b/.test(userLines)) {
    decision = "declined";
  } else if (/\b(yes|approve|proceed|go ahead|do it|approved)\b/.test(userLines)) {
    decision = "approved";
  } else if (/\b(later|defer|hold|wait|not now)\b/.test(userLines)) {
    decision = "deferred";
  }

  if (decision === "approved") {
    await updateMissionState(missionId, "queued", "Mission approved via voice call.");
  } else if (decision === "declined") {
    await updateMissionState(missionId, "declined", "Mission declined via voice call.");
  } else {
    // Deferred: stay in awaiting_approval, log the deferral
    await appendMissionEvent(missionId, {
      actor: "approval_adapter",
      type: "note_logged",
      state: "awaiting_approval",
      message: "Voice call deferred — mission stays in awaiting_approval. Manual approval available.",
      metadata: { callId: body?.call_id, transcript: rawTranscript.slice(0, 200) },
    });
  }

  return Response.json({ ok: true, decision });
}
