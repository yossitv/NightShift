// POST /api/webhooks/bland — Bland AI voice approval callback (SPEC.md §19)

import { getMission, updateMissionState } from "@/src/lib/nightshift/store";

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

  // Parse Bland AI transcript for approval/decline keywords
  const transcript = (body?.concatenated_transcript ?? body?.transcript ?? "").toLowerCase();
  let decision: "approved" | "declined" | "deferred" = "deferred";

  if (/\b(yes|approve|proceed|go ahead|do it)\b/.test(transcript)) {
    decision = "approved";
  } else if (/\b(no|decline|reject|stop|cancel)\b/.test(transcript)) {
    decision = "declined";
  }

  if (decision === "approved") {
    await updateMissionState(missionId, "queued", "Mission approved via voice call.");
  } else if (decision === "declined") {
    await updateMissionState(missionId, "declined", "Mission declined via voice call.");
  }

  return Response.json({ ok: true, decision });
}
