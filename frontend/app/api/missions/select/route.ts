// POST /api/missions/select — Auto-select issue and create mission (SPEC.md §19)

import { REPO_CONFIG, isConfiguredRepo } from "@/lib/config";
import { createMission, listMissions, getMission, updateMissionState } from "@/src/lib/nightshift/store";
import { selectIssue } from "@/lib/selector";
import { requestVoiceApproval } from "@/lib/voice";
import { runMission } from "@/lib/runner-core";
import type { GitHubIssue } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST() {
  const { owner, name, githubToken } = REPO_CONFIG;

  // §16.1: Reject unsupported repositories
  if (!isConfiguredRepo(owner, name)) {
    return Response.json(
      { error: `Unsupported repository: ${owner}/${name}` },
      { status: 400 }
    );
  }

  // Only one active mission at a time
  const existing = await listMissions();
  const active = existing.find((m) =>
    ["candidate_selected", "awaiting_approval", "queued", "planning", "coding", "testing", "retrying"].includes(m.state)
  );
  if (active) {
    return Response.json(
      { error: "A mission is already active", missionId: active.id },
      { status: 409 }
    );
  }
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  if (githubToken) headers.Authorization = `Bearer ${githubToken}`;

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${name}/issues?state=open&per_page=30&sort=updated&direction=desc`,
    { headers }
  );

  if (!res.ok) {
    return Response.json(
      { error: `GitHub API error: ${res.status}` },
      { status: 502 }
    );
  }

  const raw = (await res.json()) as GitHubIssue[];
  const issues = raw.filter((i) => !i.pull_request);

  const result = selectIssue(issues);
  if (!result) {
    return Response.json(
      { error: "No suitable issues found" },
      { status: 404 }
    );
  }

  const { issue, selectionReason, riskLevel, summary, acceptanceCriteria, nonGoals, riskNote } =
    result;

  const branchName = `${REPO_CONFIG.branchPrefix}issue-${issue.number}`;

  const mission = await createMission({
    issue: {
      owner,
      repo: name,
      number: issue.number,
      title: issue.title,
      url: issue.html_url,
    },
    summary,
    acceptanceCriteria,
    nonGoals,
    riskLevel,
    selection: {
      rationale: selectionReason,
      whyNow: "Selected from current open issues as the most bounded candidate.",
      riskNote,
    },
    latestAction: `Selected issue #${issue.number}: ${issue.title}`,
    branchName,
  });

  // Transition from candidate_selected based on risk (SPEC §10)
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

    console.log("Voice approval result:", voiceResult);
  } else {
    await updateMissionState(
      mission.id,
      "queued",
      "Low-risk mission auto-queued."
    );

    // §8.1 step 5: Low-risk missions start automatically
    runMission(mission.id).catch((err) => {
      console.error("Auto-start runner error:", err);
    });
  }

  const updated = await getMission(mission.id);

  return Response.json({
    missionId: mission.id,
    issueNumber: issue.number,
    riskLevel: updated?.riskLevel ?? riskLevel,
    status: updated?.state ?? "candidate_selected",
    selectionReason,
    summary,
  });
}
