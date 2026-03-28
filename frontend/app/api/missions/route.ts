// GET /api/missions — List all missions

import { listMissions } from "@/src/lib/nightshift/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ missions: await listMissions() });
}
