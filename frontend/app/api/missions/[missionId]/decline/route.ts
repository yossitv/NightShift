// POST /api/missions/:missionId/decline — Decline mission (SPEC.md §19)

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
      { error: `Cannot decline mission in state: ${mission.state}` },
      { status: 400 }
    );
  }

  const updated = await updateMissionState(
    missionId,
    "declined",
    "Mission declined."
  );

  return Response.json({ mission: updated });
}
