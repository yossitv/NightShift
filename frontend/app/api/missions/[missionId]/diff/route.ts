// GET /api/missions/:missionId/diff — Git diff for a mission branch

import { getMission } from "@/src/lib/nightshift/store";
import { execSync } from "child_process";
import { join } from "path";
import { existsSync } from "fs";
import { REPO_CONFIG } from "@/lib/config";

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

  const repoPath = join(process.cwd(), ".data", "repos", `${REPO_CONFIG.owner}_${REPO_CONFIG.name}`);
  if (!existsSync(join(repoPath, ".git"))) {
    return Response.json({ diff: null, stat: null, message: "No cloned repository found." });
  }

  const branchName = mission.branch.name;
  if (!branchName) {
    return Response.json({ diff: null, stat: null, message: "No branch assigned to this mission." });
  }

  try {
    // Use branch ref directly — no checkout needed
    const run = (cmd: string) => execSync(cmd, { cwd: repoPath, encoding: "utf-8", timeout: 10000 }).trim();

    // Skip git fetch on every request — runner already fetches when needed
    let stat = "";
    try { stat = run(`git diff --stat origin/main...${branchName}`); } catch { /* */ }

    let diff = "";
    try { diff = run(`git diff origin/main...${branchName}`); } catch { /* */ }

    let commits = "";
    try { commits = run(`git log --oneline origin/main...${branchName}`); } catch { /* */ }

    return Response.json({
      branch: branchName,
      stat,
      diff: diff.slice(0, 50000),
      commits,
      files: stat ? stat.split("\n").length - 1 : 0,
    });
  } catch (err: unknown) {
    return Response.json({
      diff: null,
      stat: null,
      message: `Git error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
