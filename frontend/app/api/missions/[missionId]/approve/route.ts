// POST /api/missions/:missionId/approve — Manual approval fallback (SPEC.md §19)

import { getMission, updateMissionState } from "@/src/lib/nightshift/store";

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
  if (mission.state !== "awaiting_approval") {
    return Response.json(
      { error: `Cannot approve mission in state: ${mission.state}` },
      { status: 400 }
    );
  }

  const updated = await updateMissionState(
    missionId,
    "queued",
    "Mission approved (manual fallback)."
  );

  return Response.json({ mission: updated });
}
