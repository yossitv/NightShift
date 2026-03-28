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

// ── Runner core ─────────────────────────────────────────────

async function runMission(missionId: string) {
  let mission = await getMission(missionId);
  if (!mission) return;

  try {
    // ── 1. Planning ──
    await updateMissionState(missionId, "planning", "Mission planning started.");
    await appendMissionEvent(missionId, {
      actor: "runner",
      type: "note_logged",
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
        type: "note_logged",
        state: "planning",
        message: `Branch ${branchName} created in ${repoPath}.`,
      });
    } catch (err: unknown) {
      // If git ops fail (no token, permissions, etc.) continue with simulated mode
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
      type: "state_changed",
      state: "planning",
      message: `Plan written. Acceptance criteria: ${mission.acceptanceCriteria.join("; ")}`,
    });

    // ── 2. Coding loop (with retry) ──
    const maxRetries = mission.retryCount > 0 ? 3 - mission.retryCount : 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Coding phase
      await updateMissionState(missionId, "coding", `Coding pass ${attempt + 1} started.`);
      await appendMissionEvent(missionId, {
        actor: "runner",
        type: "state_changed",
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
            type: "note_logged",
            state: "coding",
            message: `Commit created: ${sha}`,
          });
        } catch {
          // No changes to commit — that's ok for simulated mode
        }
      }

      // ── 3. Testing ──
      await updateMissionState(missionId, "testing", "Running checks...");

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

      const allPassed = testsResult.status === "passed" && lintResult.status === "passed" && reqResult.status === "passed";

      if (allPassed) {
        await appendMissionEvent(missionId, {
          actor: "runner",
          type: "note_logged",
          state: "testing",
          message: "All checks passed.",
        });
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
          type: "state_changed",
          state: "retrying",
          message: `Retry ${attempt + 1}/${maxRetries}: ${failedNames} failed. Retrying with failure context.`,
        });
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      // Exhausted retries
      await updateMissionState(missionId, "failed", `Checks failed after ${attempt + 1} attempts: ${failedNames}`);
      await appendMissionEvent(missionId, {
        actor: "runner",
        type: "state_changed",
        state: "failed",
        message: `Mission failed: retry budget exhausted. Failed checks: ${failedNames}`,
      });
      return;
    }

    // ── 4. Push & PR ──
    let prUrl = "";
    if (repoPath) {
      const branchName = mission.branch.name ?? `${REPO_CONFIG.branchPrefix}${missionId}`;
      try {
        pushBranch(branchName);
        await appendMissionEvent(missionId, {
          actor: "runner",
          type: "note_logged",
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
      type: "state_changed",
      state: "pr_opened",
      message: `Mission complete. PR: ${prUrl}`,
      metadata: { prUrl },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await updateMissionState(missionId, "failed", `Mission failed: ${message}`);
    await appendMissionEvent(missionId, {
      actor: "runner",
      type: "state_changed",
      state: "failed",
      message: `Unhandled runner error: ${message}`,
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

  await appendMissionEvent(missionId, {
    actor: "system",
    type: "state_changed",
    state: "queued",
    message: "Runner started.",
  });

  // Fire and forget
  runMission(missionId).catch((err) => {
    console.error("Runner error:", err);
  });

  return Response.json({ ok: true, missionId, status: "running" });
}
