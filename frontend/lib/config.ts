// Night Shift MVP — Configured repository (SPEC.md §16.1)
// Single-repo, single-mission configuration.

export const REPO_CONFIG = {
  owner: process.env.GITHUB_REPO_OWNER || "ys",
  name: process.env.GITHUB_REPO_NAME || "NightShift",
  branchPrefix: process.env.BRANCH_PREFIX || "nightshift/",
  maxRetries: Number(process.env.MAX_RETRIES || "3"),
  phoneNumber: process.env.BLAND_PHONE_NUMBER || null,
  blandApiKey: process.env.BLAND_API_KEY || null,
  githubToken: process.env.GITHUB_TOKEN || null,
} as const;

export function isConfiguredRepo(owner: string, name: string): boolean {
  return (
    owner.toLowerCase() === REPO_CONFIG.owner.toLowerCase() &&
    name.toLowerCase() === REPO_CONFIG.name.toLowerCase()
  );
}
