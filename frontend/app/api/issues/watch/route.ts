// GET /api/issues/watch — Poll for new issues and auto-create missions
// For localhost where GitHub webhooks can't reach.
// Call this endpoint periodically (or once) to pick up new issues.

import { REPO_CONFIG } from "@/lib/config";
import { selectIssue } from "@/lib/selector";
import { requestVoiceApproval } from "@/lib/voice";
import { runMission } from "@/lib/runner-core";
import {
  createMission,
  listMissions,
  updateMissionState,
} from "@/src/lib/nightshift/store";
import type { GitHubIssue } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const { owner, name, githubToken } = REPO_CONFIG;

  // Check for active missions
  const existing = await listMissions();
  const active = existing.find((m) =>
    ["candidate_selected", "awaiting_approval", "queued", "planning", "coding", "testing", "retrying"].includes(m.state)
  );
  if (active) {
    return Response.json({
      ok: true,
      skipped: "active mission exists",
      missionId: active.id,
    });
  }

  // Fetch open issues
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  if (githubToken) headers.Authorization = `Bearer ${githubToken}`;

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${name}/issues?state=open&per_page=30&sort=created&direction=desc`,
    { headers }
  );

  if (!res.ok) {
    return Response.json({ error: `GitHub API error: ${res.status}` }, { status: 502 });
  }

  const raw = (await res.json()) as GitHubIssue[];
  const issues = raw.filter((i) => !i.pull_request);

  if (issues.length === 0) {
    return Response.json({ ok: true, skipped: "no open issues" });
  }

  // Check which issues already have missions
  const missionIssueNumbers = new Set(existing.map((m) => m.issue.number));
  const newIssues = issues.filter((i) => !missionIssueNumbers.has(i.number));

  if (newIssues.length === 0) {
    return Response.json({ ok: true, skipped: "no new issues without missions" });
  }

  // Pick the newest unprocessed issue
  const target = newIssues[0];
  const result = selectIssue([target], target.number);
  if (!result) {
    return Response.json({ ok: true, skipped: "issue not suitable" });
  }

  const { selectionReason, riskLevel, summary, acceptanceCriteria, nonGoals, riskNote } = result;
  const branchName = `${REPO_CONFIG.branchPrefix}issue-${target.number}`;

  const mission = await createMission({
    issue: {
      owner,
      repo: name,
      number: target.number,
      title: target.title,
      body: target.body ?? null,
      url: target.html_url,
    },
    summary,
    acceptanceCriteria,
    nonGoals,
    riskLevel,
    selection: {
      rationale: selectionReason,
      whyNow: "Auto-detected by issue watcher.",
      riskNote,
    },
    latestAction: `Auto-selected issue #${target.number}: ${target.title}`,
    branchName,
  });

  if (riskLevel === "high") {
    await updateMissionState(
      mission.id,
      "awaiting_approval",
      `High-risk mission requires approval. ${riskNote}`
    );

    const voiceResult = await requestVoiceApproval({
      missionId: mission.id,
      issueNumber: target.number,
      issueTitle: target.title,
      summary,
      riskLevel,
      riskNote,
      phoneNumber: REPO_CONFIG.phoneNumber,
      webhookUrl: `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/webhooks/bland`,
    });

    console.log(`[issue-watcher] Voice approval triggered for issue #${target.number}:`, voiceResult);

    return Response.json({
      ok: true,
      action: "voice_approval_triggered",
      missionId: mission.id,
      issueNumber: target.number,
      riskLevel,
      voiceResult,
    });
  } else {
    await updateMissionState(mission.id, "queued", "Low-risk mission auto-queued.");
    runMission(mission.id).catch((err) => {
      console.error("[issue-watcher] Auto-start runner error:", err);
    });

    return Response.json({
      ok: true,
      action: "auto_started",
      missionId: mission.id,
      issueNumber: target.number,
      riskLevel,
    });
  }
}
