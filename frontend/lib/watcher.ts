// Night Shift — Automatic issue watcher
// Polls GitHub for new issues and auto-selects them as missions.

import { REPO_CONFIG } from "./config";
import { selectIssue } from "./selector";
import { requestVoiceApproval } from "./voice";
import { runMission } from "./runner-core";
import type { GitHubIssue } from "./types";
import {
  listMissions,
  createMission,
  getMission,
  updateMissionState,
} from "@/src/lib/nightshift/store";

const POLL_INTERVAL_MS = 30_000; // 30 seconds
let watcherRunning = false;
const processedIssues = new Set<number>();

export function startWatcher() {
  if (watcherRunning) return;
  watcherRunning = true;

  console.log("[NightShift Watcher] Started. Polling every 30s.");

  // Seed processedIssues from existing missions to avoid re-selecting
  listMissions().then((missions) => {
    for (const m of missions) {
      processedIssues.add(m.issue.number);
    }
    console.log(`[NightShift Watcher] ${processedIssues.size} issues already processed.`);
  });

  setInterval(async () => {
    try {
      await pollAndSelect();
    } catch (err) {
      console.error("[NightShift Watcher] Poll error:", err);
    }
  }, POLL_INTERVAL_MS);
}

async function pollAndSelect() {
  // Check if there's already an active mission
  const missions = await listMissions();
  const active = missions.find((m) =>
    ["candidate_selected", "awaiting_approval", "queued", "planning", "coding", "testing", "retrying"].includes(m.state)
  );
  if (active) return; // One mission at a time

  // Fetch open issues
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

  // Find new issues not yet processed
  const newIssues = issues.filter((i) => !processedIssues.has(i.number));
  if (newIssues.length === 0) return;

  // Pick the newest unprocessed issue
  const target = newIssues[0];
  console.log(`[NightShift Watcher] New issue detected: #${target.number} "${target.title}"`);
  processedIssues.add(target.number);

  // Select it
  const result = selectIssue(issues, target.number);
  if (!result) {
    console.log(`[NightShift Watcher] Issue #${target.number} not selectable.`);
    return;
  }

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
      whyNow: "Automatically detected as a new issue by the Night Shift watcher.",
      riskNote,
    },
    latestAction: `Auto-selected issue #${issue.number}: ${issue.title}`,
    branchName,
  });

  console.log(`[NightShift Watcher] Mission ${mission.id} created. Risk: ${riskLevel}`);

  // Transition based on risk
  if (riskLevel === "high") {
    await updateMissionState(
      mission.id,
      "awaiting_approval",
      `High-risk mission requires approval. ${riskNote}`
    );

    // Trigger phone call
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

    console.log(`[NightShift Watcher] Voice approval: ${voiceResult.mode}/${voiceResult.status}`);
  } else {
    await updateMissionState(
      mission.id,
      "queued",
      "Low-risk mission auto-queued by watcher."
    );

    // Auto-start
    runMission(mission.id).catch((err) => {
      console.error("[NightShift Watcher] Runner error:", err);
    });

    console.log(`[NightShift Watcher] Low-risk mission auto-started.`);
  }
}
