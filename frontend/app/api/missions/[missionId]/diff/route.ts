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
    // Checkout the branch
    execSync(`git checkout ${branchName} 2>/dev/null || true`, { cwd: repoPath, encoding: "utf-8", timeout: 10000 });

    // Get diff stat
    let stat: string;
    try {
      stat = execSync("git diff --stat origin/main...HEAD", { cwd: repoPath, encoding: "utf-8", timeout: 10000 }).trim();
    } catch {
      stat = execSync("git diff --stat HEAD~1 2>/dev/null || echo 'No diff available'", { cwd: repoPath, encoding: "utf-8", timeout: 10000 }).trim();
    }

    // Get full diff
    let diff: string;
    try {
      diff = execSync("git diff origin/main...HEAD", { cwd: repoPath, encoding: "utf-8", timeout: 10000 }).trim();
    } catch {
      diff = execSync("git diff HEAD~1 2>/dev/null || echo ''", { cwd: repoPath, encoding: "utf-8", timeout: 10000 }).trim();
    }

    // Get commit log
    let commits: string;
    try {
      commits = execSync("git log --oneline origin/main...HEAD", { cwd: repoPath, encoding: "utf-8", timeout: 10000 }).trim();
    } catch {
      commits = execSync("git log --oneline -5", { cwd: repoPath, encoding: "utf-8", timeout: 10000 }).trim();
    }

    return Response.json({
      branch: branchName,
      stat,
      diff: diff.slice(0, 50000), // Cap at 50KB
      commits,
      files: stat.split("\n").length - 1,
    });
  } catch (err: unknown) {
    return Response.json({
      diff: null,
      stat: null,
      message: `Git error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
