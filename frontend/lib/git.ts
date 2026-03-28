// Night Shift MVP — Git operations (SPEC.md §16.6, §16.9, §21)
// Clone/reuse repo, create mission branches, commit, push, create PR.

import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { REPO_CONFIG } from "./config";

const REPOS_DIR = join(process.cwd(), ".data", "repos");

function sanitize(text: string): string {
  // §21: Do not store secrets in logs or status views
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
  return join(REPOS_DIR, `${REPO_CONFIG.owner}_${REPO_CONFIG.name}`);
}

/**
 * Clone the configured repo if not already cloned, or fetch latest.
 */
export function ensureRepo(): string {
  const repoPath = getRepoPath();

  if (existsSync(join(repoPath, ".git"))) {
    // Already cloned — fetch latest
    run("git fetch origin", repoPath);
    return repoPath;
  }

  // Clone fresh
  const { owner, name, githubToken } = REPO_CONFIG;
  let cloneUrl: string;
  if (githubToken) {
    cloneUrl = `https://x-access-token:${githubToken}@github.com/${owner}/${name}.git`;
  } else {
    cloneUrl = `https://github.com/${owner}/${name}.git`;
  }

  execSync(`mkdir -p ${REPOS_DIR}`, { encoding: "utf-8" });
  run(`git clone --depth 50 ${cloneUrl} ${repoPath}`);
  return repoPath;
}

/**
 * Create (or reset to) a mission branch from origin/main.
 */
export function createBranch(branchName: string): string {
  const repoPath = ensureRepo();

  // Determine default branch
  let defaultBranch = "main";
  try {
    defaultBranch = run("git symbolic-ref refs/remotes/origin/HEAD", repoPath)
      .replace("refs/remotes/origin/", "");
  } catch {
    // fallback to main
  }

  // Safety: never work directly on protected branches
  if (branchName === defaultBranch || branchName === "main" || branchName === "master") {
    throw new Error(`Refusing to work on protected branch: ${branchName}`);
  }

  // Create or switch to branch
  try {
    run(`git checkout -B ${branchName} origin/${defaultBranch}`, repoPath);
  } catch {
    run(`git checkout -b ${branchName}`, repoPath);
  }

  return repoPath;
}

/**
 * Stage all changes, commit with a message.
 */
export function commitChanges(message: string): string {
  const repoPath = getRepoPath();
  run("git add -A", repoPath);

  // Check if there are changes to commit
  const status = run("git status --porcelain", repoPath);
  if (!status) return "no changes";

  run(`git commit -m "${message.replace(/"/g, '\\"')}"`, repoPath);
  return run("git rev-parse --short HEAD", repoPath);
}

/**
 * Push the branch to origin.
 */
export function pushBranch(branchName: string): void {
  const repoPath = getRepoPath();
  run(`git push -u origin ${branchName}`, repoPath);
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
    // Simulate PR creation for demo without token
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

  // Add comment
  await fetch(`https://api.github.com/repos/${owner}/${name}/issues/${issueNumber}/comments`, {
    method: "POST",
    headers,
    body: JSON.stringify({ body: comment }),
  });

  // Close issue
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
  const repoPath = getRepoPath();
  try {
    return run("git diff --stat origin/main...HEAD", repoPath);
  } catch {
    return run("git diff --stat HEAD~1", repoPath);
  }
}
