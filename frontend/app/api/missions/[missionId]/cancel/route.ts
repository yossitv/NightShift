// POST /api/missions/:missionId/cancel — Cancel a running mission (SPEC.md §10)

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

  const terminal = ["pr_opened", "failed", "canceled", "declined"];
  if (terminal.includes(mission.state)) {
    return Response.json(
      { error: `Mission already in terminal state: ${mission.state}` },
      { status: 400 }
    );
  }

  const updated = await updateMissionState(
    missionId,
    "canceled",
    "Mission canceled by operator."
  );

  return Response.json({ mission: updated });
}
