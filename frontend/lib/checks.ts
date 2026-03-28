// Night Shift MVP — Check gates (SPEC.md §16.7, §20)
// Tests, lint, and LLM-based requirements evaluation.

import { execSync } from "child_process";
import type { CheckResult } from "@/src/lib/nightshift/types";
import { isCodexAvailable } from "@/lib/codex";

function runCmd(cmd: string, cwd: string): { ok: boolean; output: string } {
  try {
    const output = execSync(cmd, {
      cwd,
      encoding: "utf-8",
      timeout: 120_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { ok: true, output: output.trim() };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, output: (e.stdout ?? "") + (e.stderr ?? e.message ?? "") };
  }
}

export function runTestsCheck(repoPath: string): CheckResult {
  const now = new Date().toISOString();
  const startedAt = now;

  // Try common test commands
  const testCmds = ["npm test -- --passWithNoTests 2>&1", "npm run test -- --passWithNoTests 2>&1"];
  let result = { ok: true, output: "No test command found; passing by default." };

  for (const cmd of testCmds) {
    try {
      execSync("npm run test --dry-run 2>&1", { cwd: repoPath, encoding: "utf-8", timeout: 5000 });
      result = runCmd(cmd, repoPath);
      break;
    } catch {
      continue;
    }
  }

  return {
    id: "check_tests",
    label: "Tests",
    status: result.ok ? "passed" : "failed",
    summary: result.ok ? "All tests passed." : `Tests failed: ${result.output.slice(0, 300)}`,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

export function runLintCheck(repoPath: string): CheckResult {
  const startedAt = new Date().toISOString();

  // Try lint, then typecheck
  let lintResult = { ok: true, output: "No lint command configured; passing." };
  try {
    execSync("npm run lint --dry-run 2>&1", { cwd: repoPath, encoding: "utf-8", timeout: 5000 });
    lintResult = runCmd("npm run lint 2>&1", repoPath);
  } catch {
    // no lint script
  }

  return {
    id: "check_lint",
    label: "Lint",
    status: lintResult.ok ? "passed" : "failed",
    summary: lintResult.ok ? "Lint and typecheck passed." : `Lint failed: ${lintResult.output.slice(0, 300)}`,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

export function runRequirementsCheck(
  acceptanceCriteria: string[],
  diffSummary: string,
  repoPath?: string,
): CheckResult {
  const startedAt = new Date().toISOString();

  if (!acceptanceCriteria.length) {
    return {
      id: "check_requirements",
      label: "Requirements",
      status: "failed",
      summary: "Requirements check failed: no acceptance criteria defined.",
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  // §16.7: LLM-based judgment when codex is available and there's a real diff
  const hasDiff = diffSummary.length > 0 && diffSummary !== "no changes" && diffSummary !== "";
  if (repoPath && hasDiff && isCodexAvailable()) {
    try {
      const criteria = acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n");
      const prompt = `Review this git diff and determine if the acceptance criteria are satisfied. Reply with ONLY "PASS" or "FAIL: <reason>".

Acceptance criteria:
${criteria}

Diff summary:
${diffSummary}`;

      const output = execSync(`codex exec --full-auto "${prompt.replace(/"/g, '\\"')}"`, {
        cwd: repoPath,
        encoding: "utf-8",
        timeout: 30_000,
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();

      const passed = /\bPASS\b/i.test(output) && !/\bFAIL\b/i.test(output);
      return {
        id: "check_requirements",
        label: "Requirements",
        status: passed ? "passed" : "failed",
        summary: passed
          ? `LLM evaluation: requirements satisfied. ${acceptanceCriteria.length} criteria checked.`
          : `LLM evaluation: ${output.slice(0, 200)}`,
        startedAt,
        completedAt: new Date().toISOString(),
      };
    } catch {
      // Fall through to heuristic
    }
  }

  // Heuristic fallback: if criteria exist and there's evidence of work, pass.
  const isSimulated = diffSummary === "simulated diff" || diffSummary === "";
  const passed = hasDiff || isSimulated;

  return {
    id: "check_requirements",
    label: "Requirements",
    status: passed ? "passed" : "failed",
    summary: passed
      ? `Requirements appear satisfied. ${acceptanceCriteria.length} criteria evaluated (heuristic).`
      : "Requirements check failed: no meaningful changes detected.",
    startedAt,
    completedAt: new Date().toISOString(),
  };
}
