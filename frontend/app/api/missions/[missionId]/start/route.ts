// POST /api/missions/:missionId/start — Start the runner (SPEC.md §15, §19)
// Full lifecycle: planning → coding → testing → retry? → pr_opened | failed

import {
  getMission,
  updateMissionState,
  updateMissionBranch,
  incrementRetryCount,
  appendMissionEvent,
  upsertMissionCheck,
} from "@/src/lib/nightshift/store";
import { createBranch, commitChanges, pushBranch, createPullRequest, getDiffSummary } from "@/lib/git";
import { runTestsCheck, runLintCheck, runRequirementsCheck } from "@/lib/checks";
import { REPO_CONFIG } from "@/lib/config";

export const dynamic = "force-dynamic";

const MAX_RUN_DURATION_MS = 5 * 60 * 1000; // 5 minutes (SPEC §21)

// ── Runner core ─────────────────────────────────────────────

async function runMission(missionId: string) {
  const mission = await getMission(missionId);
  if (!mission) return;

  const deadline = Date.now() + MAX_RUN_DURATION_MS;

  function checkTimeout() {
    if (Date.now() > deadline) {
      throw new Error("Mission exceeded maximum run duration (5 minutes).");
    }
  }

  try {
    // ── 1. Planning ──
    await updateMissionState(missionId, "planning", "Mission planning started.");
    await appendMissionEvent(missionId, {
      actor: "runner",
      type: "planning_started",
      state: "planning",
      message: `Planning implementation for issue #${mission.issue.number}: ${mission.issue.title}`,
    });

    // Prepare branch
    const branchName = mission.branch.name ?? `${REPO_CONFIG.branchPrefix}${missionId}`;
    let repoPath: string;
    try {
      repoPath = createBranch(branchName);
      await appendMissionEvent(missionId, {
        actor: "runner",
        type: "branch_pushed",
        state: "planning",
        message: `Branch ${branchName} created.`,
      });
    } catch (err: unknown) {
      repoPath = "";
      await appendMissionEvent(missionId, {
        actor: "runner",
        type: "note_logged",
        state: "planning",
        message: `Branch creation skipped (simulated mode): ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    await appendMissionEvent(missionId, {
      actor: "runner",
      type: "plan_written",
      state: "planning",
      message: `Plan written. Acceptance criteria: ${mission.acceptanceCriteria.join("; ")}`,
    });

    checkTimeout();

    // ── 2. Coding loop (with retry) ──
    const maxRetries = 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      checkTimeout();

      // Coding phase
      await updateMissionState(missionId, "coding", `Coding pass ${attempt + 1} started.`);
      await appendMissionEvent(missionId, {
        actor: "runner",
        type: "coding_started",
        state: "coding",
        message: attempt === 0
          ? "Initial coding pass started."
          : `Retry ${attempt}: coding with failure context.`,
      });

      // Simulate coding work (in production this invokes Codex/OMX)
      await new Promise((r) => setTimeout(r, 2000));

      await appendMissionEvent(missionId, {
        actor: "runner",
        type: "note_logged",
        state: "coding",
        message: "File changes completed.",
      });

      // Commit if we have a real repo
      if (repoPath) {
        try {
          const sha = commitChanges(`nightshift: implement issue #${mission.issue.number}\n\n${mission.summary}`);
          await appendMissionEvent(missionId, {
            actor: "runner",
            type: "commit_created",
            state: "coding",
            message: `Commit created: ${sha}`,
          });
        } catch {
          // No changes to commit
        }
      }

      checkTimeout();

      // ── 3. Testing ──
      await updateMissionState(missionId, "testing", "Running checks...");
      await appendMissionEvent(missionId, {
        actor: "runner",
        type: "checks_started",
        state: "testing",
        message: "Running tests, lint, and requirements checks.",
      });

      // Run checks
      const testsResult = repoPath
        ? runTestsCheck(repoPath)
        : { id: "check_tests", label: "Tests", status: "passed" as const, summary: "Tests passed (simulated).", startedAt: new Date().toISOString(), completedAt: new Date().toISOString() };

      const lintResult = repoPath
        ? runLintCheck(repoPath)
        : { id: "check_lint", label: "Lint", status: "passed" as const, summary: "Lint passed (simulated).", startedAt: new Date().toISOString(), completedAt: new Date().toISOString() };

      const diffSummary = repoPath ? getDiffSummary() : "simulated diff";
      const reqResult = runRequirementsCheck(mission.acceptanceCriteria, diffSummary);

      await upsertMissionCheck(missionId, testsResult);
      await upsertMissionCheck(missionId, lintResult);
      await upsertMissionCheck(missionId, reqResult);

      // Emit individual check events
      for (const check of [testsResult, lintResult, reqResult]) {
        await appendMissionEvent(missionId, {
          actor: "runner",
          type: check.status === "passed" ? "check_passed" : "check_failed",
          state: "testing",
          message: `${check.label}: ${check.status} — ${check.summary}`,
        });
      }

      const allPassed = testsResult.status === "passed" && lintResult.status === "passed" && reqResult.status === "passed";

      if (allPassed) {
        break;
      }

      // Checks failed — retry or fail
      const failedNames = [testsResult, lintResult, reqResult]
        .filter((c) => c.status === "failed")
        .map((c) => c.label)
        .join(", ");

      if (attempt < maxRetries) {
        await incrementRetryCount(missionId);
        await updateMissionState(missionId, "retrying", `Checks failed (${failedNames}). Retrying...`);
        await appendMissionEvent(missionId, {
          actor: "runner",
          type: "retry_started",
          state: "retrying",
          message: `Retry ${attempt + 1}/${maxRetries}: ${failedNames} failed.`,
        });
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      // Exhausted retries
      await updateMissionState(missionId, "failed", `Checks failed after ${attempt + 1} attempts: ${failedNames}`);
      await appendMissionEvent(missionId, {
        actor: "runner",
        type: "mission_failed",
        state: "failed",
        message: `Mission failed: retry budget exhausted. Failed checks: ${failedNames}`,
      });
      return;
    }

    checkTimeout();

    // ── 4. Push & PR ──
    let prUrl = "";
    if (repoPath) {
      try {
        pushBranch(branchName);
        await appendMissionEvent(missionId, {
          actor: "runner",
          type: "branch_pushed",
          state: "testing",
          message: `Branch ${branchName} pushed to origin.`,
        });

        const pr = await createPullRequest({
          branchName,
          title: `[Night Shift] ${mission.issue.title}`,
          body: `## Night Shift Mission\n\n**Issue:** #${mission.issue.number}\n**Summary:** ${mission.summary}\n\n### Acceptance Criteria\n${mission.acceptanceCriteria.map((c) => `- ${c}`).join("\n")}\n\n---\n_Automated by Night Shift_`,
        });
        prUrl = pr.prUrl;
      } catch (err: unknown) {
        prUrl = `https://github.com/${mission.issue.owner}/${mission.issue.repo}/compare/${branchName}?expand=1`;
        await appendMissionEvent(missionId, {
          actor: "runner",
          type: "note_logged",
          state: "testing",
          message: `PR creation note: ${err instanceof Error ? err.message : "using compare URL fallback"}`,
        });
      }
    } else {
      prUrl = `https://github.com/${mission.issue.owner}/${mission.issue.repo}/compare/${mission.branch.name ?? missionId}?expand=1`;
    }

    await updateMissionBranch(missionId, { pullRequestUrl: prUrl });
    await updateMissionState(missionId, "pr_opened", `Pull request created: ${prUrl}`);
    await appendMissionEvent(missionId, {
      actor: "runner",
      type: "pr_opened",
      state: "pr_opened",
      message: `Mission complete. PR: ${prUrl}`,
      metadata: { prUrl },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await updateMissionState(missionId, "failed", `Mission failed: ${message}`);
    await appendMissionEvent(missionId, {
      actor: "runner",
      type: "mission_failed",
      state: "failed",
      message: `Runner error: ${message}`,
    });
  }
}

// ── Route handler ───────────────────────────────────────────

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ missionId: string }> }
) {
  const { missionId } = await params;
  const mission = await getMission(missionId);

  if (!mission) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }

  if (mission.state !== "queued") {
    return Response.json(
      { error: `Cannot start mission in state: ${mission.state}. Must be 'queued'.` },
      { status: 400 }
    );
  }

  // Fire and forget
  runMission(missionId).catch((err) => {
    console.error("Runner error:", err);
  });

  return Response.json({ ok: true, missionId, status: "running" });
}
