// POST /api/webhooks/github — GitHub webhook receiver for issue events
// When deployed with a public URL, register this as a GitHub webhook.

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

export async function POST(req: Request) {
  const event = req.headers.get("x-github-event");
  if (event !== "issues") {
    return Response.json({ ok: true, skipped: "not an issues event" });
  }

  const payload = await req.json();
  if (payload.action !== "opened") {
    return Response.json({ ok: true, skipped: `action=${payload.action}` });
  }

  const issue = payload.issue as GitHubIssue;
  if (!issue) {
    return Response.json({ error: "No issue in payload" }, { status: 400 });
  }

  return handleNewIssue(issue);
}

async function handleNewIssue(issue: GitHubIssue) {
  // Check for active missions
  const existing = await listMissions();
  const active = existing.find((m) =>
    ["candidate_selected", "awaiting_approval", "queued", "planning", "coding", "testing", "retrying"].includes(m.state)
  );
  if (active) {
    return Response.json({
      ok: false,
      skipped: "active mission exists",
      missionId: active.id,
    });
  }

  const result = selectIssue([issue], issue.number);
  if (!result) {
    return Response.json({ ok: false, skipped: "issue not suitable" });
  }

  const { owner, name } = REPO_CONFIG;
  const { selectionReason, riskLevel, summary, acceptanceCriteria, nonGoals, riskNote } = result;
  const branchName = `${REPO_CONFIG.branchPrefix}issue-${issue.number}`;

  const mission = await createMission({
    issue: {
      owner,
      repo: name,
      number: issue.number,
      title: issue.title,
      body: issue.body ?? null,
      url: issue.html_url,
    },
    summary,
    acceptanceCriteria,
    nonGoals,
    riskLevel,
    selection: {
      rationale: selectionReason,
      whyNow: "Auto-triggered by new issue creation.",
      riskNote,
    },
    latestAction: `Auto-selected issue #${issue.number}: ${issue.title}`,
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
      issueNumber: issue.number,
      issueTitle: issue.title,
      summary,
      riskLevel,
      riskNote,
      phoneNumber: REPO_CONFIG.phoneNumber,
      webhookUrl: `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/webhooks/bland`,
    });

    console.log(`[issue-watcher] Voice approval triggered for issue #${issue.number}:`, voiceResult);
  } else {
    await updateMissionState(mission.id, "queued", "Low-risk mission auto-queued.");
    runMission(mission.id).catch((err) => {
      console.error("[issue-watcher] Auto-start runner error:", err);
    });
  }

  return Response.json({
    ok: true,
    missionId: mission.id,
    issueNumber: issue.number,
    riskLevel,
  });
}
