// GET /api/missions/:missionId/events — Mission events (SPEC.md §19)

import { listMissionEvents } from "@/src/lib/nightshift/store";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ missionId: string }> }
) {
  const { missionId } = await params;
  const events = await listMissionEvents(missionId);
  return Response.json({ events });
}
