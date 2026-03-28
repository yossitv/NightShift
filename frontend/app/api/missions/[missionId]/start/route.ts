// POST /api/missions/:missionId/start — Start the runner (SPEC.md §19)

import { getMission } from "@/src/lib/nightshift/store";
import { runMission } from "@/lib/runner-core";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ missionId: string }> }
) {
  const { missionId } = await params;
  const mission = await getMission(missionId);

  if (!mission) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }

  if (mission.state !== "queued") {
    return Response.json(
      { error: `Cannot start mission in state: ${mission.state}. Must be 'queued'.` },
      { status: 400 }
    );
  }

  // Fire and forget
  runMission(missionId).catch((err) => {
    console.error("Runner error:", err);
  });

  return Response.json({ ok: true, missionId, status: "running" });
}
