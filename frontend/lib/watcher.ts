// Night Shift — Automatic issue watcher
// Polls GitHub for new issues. Two independent responsibilities:
// 1. Immediately call the operator for high-risk issues (no mission needed)
// 2. Create missions when no active mission is running

import { REPO_CONFIG } from "./config";
import { selectIssue } from "./selector";
import { requestVoiceApproval } from "./voice";
import { runMission } from "./runner-core";
import { notifyHighRiskIssue, getPendingQueue, removePending } from "./issue-notifier";
import type { GitHubIssue } from "./types";
import {
  listMissions,
  createMission,
  updateMissionState,
} from "@/src/lib/nightshift/store";

const POLL_INTERVAL_MS = 30_000; // 30 seconds
let watcherRunning = false;
const processedIssues = new Set<number>(); // issues already turned into missions
const notifiedIssues = new Set<number>();  // issues already called about

export function startWatcher() {
  if (watcherRunning) return;
  watcherRunning = true;

  console.log("[Watcher] Started. Polling every 30s.");

  // Seed from existing missions
  listMissions().then((missions) => {
    for (const m of missions) {
      processedIssues.add(m.issue.number);
      notifiedIssues.add(m.issue.number);
    }
    console.log(`[Watcher] ${processedIssues.size} issues already known.`);
  });

  setInterval(async () => {
    try {
      await poll();
    } catch (err) {
      console.error("[Watcher] Poll error:", err);
    }
  }, POLL_INTERVAL_MS);
}

async function poll() {
  const { owner, name, githubToken } = REPO_CONFIG;
  if (!githubToken) return;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${githubToken}`,
  };

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${name}/issues?state=open&per_page=20&sort=created&direction=desc`,
    { headers }
  );
  if (!res.ok) return;

  const raw = (await res.json()) as GitHubIssue[];
  const issues = raw.filter((i) => !i.pull_request);

  // ── Step 1: Notify about NEW high-risk issues (independent of missions) ──
  for (const issue of issues) {
    if (notifiedIssues.has(issue.number)) continue;
    notifiedIssues.add(issue.number);

    const result = selectIssue([issue], issue.number);
    if (!result) continue;

    if (result.riskLevel === "high") {
      console.log(`[Watcher] New high-risk issue #${issue.number} — calling operator.`);
      notifyHighRiskIssue(issue, result.riskNote).catch((err) => {
        console.error(`[Watcher] Notify error for #${issue.number}:`, err);
      });
    } else {
      console.log(`[Watcher] New low-risk issue #${issue.number} — will auto-queue when ready.`);
    }
  }

  // ── Step 2: Create mission if no active mission ──
  const missions = await listMissions();
  const active = missions.find((m) =>
    ["candidate_selected", "awaiting_approval", "queued", "planning", "coding", "testing", "retrying"].includes(m.state)
  );
  if (active) return;

  // Check pending queue first — pick approved issues from calls
  const pending = getPendingQueue();
  const approved = pending.find((p) => p.decision === "approved");

  if (approved) {
    console.log(`[Watcher] Pending issue #${approved.issue.number} was approved — creating mission.`);
    await createMissionFromIssue(issues, approved.issue, "Approved via voice notification.");
    removePending(approved.issue.number);
    return;
  }

  // Otherwise pick the best unprocessed issue
  const unprocessed = issues.filter((i) => !processedIssues.has(i.number));
  if (unprocessed.length === 0) return;

  const target = unprocessed[0];
  console.log(`[Watcher] Auto-selecting issue #${target.number} "${target.title}"`);
  await createMissionFromIssue(issues, target, "Automatically detected by watcher.");
}

async function createMissionFromIssue(
  allIssues: GitHubIssue[],
  target: GitHubIssue,
  whyNow: string
) {
  processedIssues.add(target.number);

  const result = selectIssue(allIssues, target.number);
  if (!result) return;

  const { owner, name } = REPO_CONFIG;
  const { issue, selectionReason, riskLevel, summary, acceptanceCriteria, nonGoals, riskNote } = result;
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
      whyNow,
      riskNote,
    },
    latestAction: `Auto-selected issue #${issue.number}: ${issue.title}`,
    branchName,
  });

  console.log(`[Watcher] Mission ${mission.id} created. Risk: ${riskLevel}`);

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

    console.log(`[Watcher] Voice approval: ${voiceResult.mode}/${voiceResult.status}`);
  } else {
    await updateMissionState(mission.id, "queued", "Low-risk mission auto-queued by watcher.");
    runMission(mission.id).catch((err) => {
      console.error("[Watcher] Runner error:", err);
    });
    console.log(`[Watcher] Low-risk mission auto-started.`);
  }
}
