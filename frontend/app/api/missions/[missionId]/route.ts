// GET /api/missions/:missionId — Mission details (SPEC.md §19)

import { getMission, listMissionEvents } from "@/src/lib/nightshift/store";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ missionId: string }> }
) {
  const { missionId } = await params;
  const mission = await getMission(missionId);
  if (!mission) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }
  const events = await listMissionEvents(missionId);
  const latestEvent = events.length > 0 ? events[0] : null;
  return Response.json({ mission, checks: mission.checks, latestEvent });
}
