// Night Shift MVP — Git operations (SPEC.md §16.6, §16.9, §21)
// Manages dev-app/ as a worktree of the configured repository.
// The repo configured via GITHUB_REPO_OWNER/GITHUB_REPO_NAME env vars
// is cloned once, then mission branches are created as worktrees under dev-app/.

import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { REPO_CONFIG } from "./config";

// Bare clone lives here (hidden)
const BARE_DIR = join(process.cwd(), ".data", "bare-repo");
// Working directory for the current mission branch
const DEV_APP = join(process.cwd(), "..", "dev-app");

function sanitize(text: string): string {
  return text.replace(/x-access-token:[^@]+@/g, "x-access-token:***@");
}

function run(cmd: string, cwd?: string): string {
  try {
    return execSync(cmd, {
      cwd,
      encoding: "utf-8",
      timeout: 60_000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    throw new Error(sanitize(`git command failed: ${cmd}\n${e.stderr ?? e.message}`));
  }
}

export function getRepoPath(): string {
  return DEV_APP;
}

/**
 * Ensure the bare clone exists and is up to date.
 */
function ensureBare(): string {
  if (existsSync(join(BARE_DIR, "HEAD"))) {
    run("git fetch origin", BARE_DIR);
    return BARE_DIR;
  }

  const { owner, name, githubToken } = REPO_CONFIG;
  const cloneUrl = githubToken
    ? `https://x-access-token:${githubToken}@github.com/${owner}/${name}.git`
    : `https://github.com/${owner}/${name}.git`;

  execSync(`mkdir -p ${BARE_DIR}`, { encoding: "utf-8" });
  run(`git clone --bare ${cloneUrl} ${BARE_DIR}`);
  return BARE_DIR;
}

/**
 * Create dev-app/ as a worktree for the given branch.
 * If dev-app/ already exists, switch it to the new branch.
 */
export function createBranch(branchName: string): string {
  const bare = ensureBare();

  // Safety: never work on protected branches
  if (branchName === "main" || branchName === "master") {
    throw new Error(`Refusing to work on protected branch: ${branchName}`);
  }

  if (existsSync(join(DEV_APP, ".git"))) {
    // dev-app/ worktree already exists — switch branch
    try {
      run(`git fetch origin`, DEV_APP);
    } catch { /* bare might not have remote configured in worktree */ }
    try {
      run(`git checkout -B ${branchName} origin/main`, DEV_APP);
    } catch {
      run(`git checkout -b ${branchName}`, DEV_APP);
    }
    return DEV_APP;
  }

  // Create fresh worktree
  // First create the branch in the bare repo
  try {
    run(`git branch ${branchName} origin/main 2>/dev/null || git branch ${branchName} main`, bare);
  } catch {
    // Branch might already exist
  }

  try {
    run(`git worktree add ${DEV_APP} ${branchName}`, bare);
  } catch {
    // Worktree might already be registered — try direct clone fallback
    if (!existsSync(join(DEV_APP, ".git"))) {
      const { owner, name, githubToken } = REPO_CONFIG;
      const cloneUrl = githubToken
        ? `https://x-access-token:${githubToken}@github.com/${owner}/${name}.git`
        : `https://github.com/${owner}/${name}.git`;
      run(`git clone --depth 50 -b main ${cloneUrl} ${DEV_APP}`);
      run(`git checkout -b ${branchName}`, DEV_APP);
    }
  }

  return DEV_APP;
}

/**
 * Stage all changes, commit with a message.
 */
export function commitChanges(message: string): string {
  run("git add -A", DEV_APP);
  const status = run("git status --porcelain", DEV_APP);
  if (!status) return "no changes";

  run(`git commit -m "${message.replace(/"/g, '\\"')}"`, DEV_APP);
  return run("git rev-parse --short HEAD", DEV_APP);
}

/**
 * Push the branch to origin.
 */
export function pushBranch(branchName: string): void {
  // Ensure remote is configured in the worktree
  const { owner, name, githubToken } = REPO_CONFIG;
  const pushUrl = githubToken
    ? `https://x-access-token:${githubToken}@github.com/${owner}/${name}.git`
    : `https://github.com/${owner}/${name}.git`;

  try {
    run(`git remote set-url origin ${pushUrl}`, DEV_APP);
  } catch {
    run(`git remote add origin ${pushUrl}`, DEV_APP);
  }

  run(`git push -u origin ${branchName}`, DEV_APP);
}

/**
 * Create a GitHub pull request via the API.
 */
export async function createPullRequest(opts: {
  branchName: string;
  title: string;
  body: string;
}): Promise<{ prUrl: string; prNumber: number }> {
  const { owner, name, githubToken } = REPO_CONFIG;

  if (!githubToken) {
    const prUrl = `https://github.com/${owner}/${name}/compare/${opts.branchName}?expand=1`;
    return { prUrl, prNumber: 0 };
  }

  const res = await fetch(`https://api.github.com/repos/${owner}/${name}/pulls`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: opts.title,
      body: opts.body,
      head: opts.branchName,
      base: "main",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create PR: ${res.status} ${err}`);
  }

  const data = (await res.json()) as { html_url: string; number: number };
  return { prUrl: data.html_url, prNumber: data.number };
}

/**
 * Close a GitHub issue with a comment.
 */
export async function closeIssue(issueNumber: number, comment: string): Promise<void> {
  const { owner, name, githubToken } = REPO_CONFIG;
  if (!githubToken) return;

  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${githubToken}`,
    "Content-Type": "application/json",
  };

  await fetch(`https://api.github.com/repos/${owner}/${name}/issues/${issueNumber}/comments`, {
    method: "POST",
    headers,
    body: JSON.stringify({ body: comment }),
  });

  await fetch(`https://api.github.com/repos/${owner}/${name}/issues/${issueNumber}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ state: "closed", state_reason: "not_planned" }),
  });
}

/**
 * Get a summary of the diff on the current branch vs origin/main.
 */
export function getDiffSummary(): string {
  try {
    return run("git diff --stat origin/main...HEAD", DEV_APP);
  } catch {
    try {
      return run("git diff --stat HEAD~1", DEV_APP);
    } catch {
      return "";
    }
  }
}
