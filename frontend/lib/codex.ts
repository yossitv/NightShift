// Night Shift MVP — Codex/OMX execution wrapper (SPEC.md §12, Build Order #8)
// Invokes `codex exec --full-auto` to solve an issue in a given repo.

import { execSync, spawn } from "child_process";

export type CodexResult = {
  success: boolean;
  output: string;
  events: string[];
};

/**
 * Run Codex CLI to implement a mission in the given repo directory.
 * Returns when codex finishes (success or failure).
 */
export async function runCodex(
  repoPath: string,
  mission: {
    issueNumber: number;
    issueTitle: string;
    summary: string;
    acceptanceCriteria: string[];
  },
  failureContext?: string | null,
  timeoutMs = 180_000, // 3 minutes
): Promise<CodexResult> {
  const prompt = buildPrompt(mission, failureContext);
  const events: string[] = [];
  let output = "";

  return new Promise((resolve) => {
    const proc = spawn("codex", ["exec", "--full-auto", "--json", prompt], {
      cwd: repoPath,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: timeoutMs,
      env: { ...process.env, TERM: "dumb" },
    });

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      resolve({
        success: false,
        output: output + "\n[Codex timed out after " + timeoutMs / 1000 + "s]",
        events,
      });
    }, timeoutMs);

    proc.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      // Parse JSONL events
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("{")) {
          events.push(trimmed);
        }
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        success: code === 0,
        output: output.slice(-5000), // Keep last 5KB
        events,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        success: false,
        output: `Codex spawn error: ${err.message}`,
        events,
      });
    });
  });
}

/**
 * Quick check if codex CLI is available.
 */
export function isCodexAvailable(): boolean {
  try {
    execSync("codex --version", { stdio: "pipe", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function buildPrompt(
  mission: {
    issueNumber: number;
    issueTitle: string;
    summary: string;
    acceptanceCriteria: string[];
  },
  failureContext?: string | null,
): string {
  let prompt = `You are solving GitHub issue #${mission.issueNumber}: "${mission.issueTitle}"

## Mission Summary
${mission.summary}

## Acceptance Criteria
${mission.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}

## Rules
- Only solve the described issue. Do not expand scope.
- Keep diffs small and reviewable.
- Run existing tests if available. Fix any you break.
- Do not modify CI/CD configuration or unrelated files.
- Commit your changes when done.`;

  if (failureContext) {
    prompt += `

## Previous Attempt Failed
The previous coding pass failed checks. Fix the issues below before proceeding:

${failureContext}`;
  }

  return prompt;
}
