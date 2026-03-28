// GET /api/issues/pending — Return issues that have been called about but not yet turned into missions

import { getPendingQueue } from "@/lib/issue-notifier";

export const dynamic = "force-dynamic";

export async function GET() {
  const pending = getPendingQueue();
  return Response.json({ pending });
}
