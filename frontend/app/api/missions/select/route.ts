// POST /api/missions/select — Auto-select issue and create mission (SPEC.md §19)

import { REPO_CONFIG } from "@/lib/config";
import { createMission, listMissions } from "@/src/lib/nightshift/store";
import { selectIssue } from "@/lib/selector";
import { requestVoiceApproval } from "@/lib/voice";
import type { GitHubIssue } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST() {
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

  // Fetch open issues
  const { owner, name, githubToken } = REPO_CONFIG;
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

  // Trigger voice approval for high-risk missions
  if (riskLevel === "high") {
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
  }

  return Response.json({
    missionId: mission.id,
    issueNumber: issue.number,
    riskLevel: mission.riskLevel,
    status: mission.state,
    selectionReason,
    summary,
  });
}
