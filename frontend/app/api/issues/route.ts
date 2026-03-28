// GET /api/issues — Fetch open issues for the configured repository (SPEC.md §19)

import { REPO_CONFIG } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
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
      { error: `GitHub API error: ${res.status} ${res.statusText}` },
      { status: 502 }
    );
  }

  const raw = await res.json();

  // Filter out pull requests (GitHub returns them mixed with issues)
  const issues = (raw as Array<Record<string, unknown>>).filter(
    (i) => !i.pull_request
  );

  return Response.json({ issues });
}
