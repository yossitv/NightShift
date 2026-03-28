import Link from "next/link";
import { readMissionStore } from "@/src/lib/nightshift/store";
import { REPO_CONFIG } from "@/lib/config";
import { isCodexAvailable } from "@/lib/codex";
import type { Mission, MissionEvent } from "@/src/lib/nightshift/types";
import { IssueSelectButton, AutoRefresh } from "../components/MissionActions";
import { execSync } from "child_process";
import { join } from "path";
import { existsSync } from "fs";

export const dynamic = "force-dynamic";

/* ── Primitives ────────────────────────────────────────────── */

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-[1.75rem] border border-white/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] ${className}`}>
      {children}
    </section>
  );
}

function Header({ eyebrow, title, right }: { eyebrow: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6">
      <div className="space-y-1">
        <p className="font-mono text-[0.7rem] uppercase tracking-[0.32em] text-cyan-200/70">{eyebrow}</p>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
      </div>
      {right}
    </div>
  );
}

function Pill({ tone = "gray", children }: { tone?: string; children: React.ReactNode }) {
  const c: Record<string, string> = {
    cyan: "border-cyan-300/35 bg-cyan-300/10 text-cyan-100",
    green: "border-emerald-300/35 bg-emerald-300/10 text-emerald-100",
    orange: "border-orange-300/35 bg-orange-300/10 text-orange-100",
    red: "border-red-300/35 bg-red-300/10 text-red-100",
    gray: "border-white/15 bg-white/5 text-slate-200",
    purple: "border-[#634BFF]/35 bg-[#634BFF]/10 text-[#a594ff]",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[0.68rem] uppercase tracking-[0.2em] ${c[tone] ?? c.gray}`}>
      {children}
    </span>
  );
}

function stateTone(s: string) {
  if (s === "pr_opened") return "green";
  if (s === "failed" || s === "declined" || s === "canceled") return "red";
  if (s === "awaiting_approval" || s === "retrying") return "orange";
  if (s === "planning" || s === "coding" || s === "testing") return "cyan";
  if (s === "queued" || s === "candidate_selected") return "purple";
  return "gray";
}

function fmt(v: string | null) {
  if (!v) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "short", timeStyle: "medium" }).format(new Date(v));
}

const REPO_PATH = join(process.cwd(), ".data", "repos", `${REPO_CONFIG.owner}_${REPO_CONFIG.name}`);
let _fetched = false;

function ensureFetched() {
  if (_fetched) return;
  if (!existsSync(join(REPO_PATH, ".git"))) return;
  try { execSync("git fetch origin 2>/dev/null || true", { cwd: REPO_PATH, timeout: 10000 }); } catch { /* */ }
  _fetched = true;
}

function getDiffForBranch(branchName: string | null): { stat: string; diff: string; commits: string } | null {
  if (!branchName) return null;
  if (!existsSync(join(REPO_PATH, ".git"))) return null;
  // No fetch here — called once in ensureFetched
  try {
    const run = (cmd: string) => execSync(cmd, { cwd: REPO_PATH, encoding: "utf-8", timeout: 5000 }).trim();
    const stat = run(`git diff --stat origin/main...${branchName} 2>/dev/null || echo ''`);
    const diff = run(`git diff origin/main...${branchName} 2>/dev/null || echo ''`);
    const commits = run(`git log --oneline origin/main...${branchName} 2>/dev/null || echo ''`);
    if (stat || diff) return { stat, diff: diff.slice(0, 15000), commits };
  } catch { /* ignore */ }
  return null;
}

/* ── Page ───────────────────────────────────────────────────── */

export default async function OverviewPage() {
  const store = await readMissionStore();
  const missions = store.missions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const allEvents = store.events.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Fetch GitHub issues
  type GHIssue = { number: number; title: string; state: string; labels: { name: string }[]; created_at: string; html_url: string };
  let ghIssues: GHIssue[] = [];
  try {
    const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
    if (REPO_CONFIG.githubToken) headers.Authorization = `Bearer ${REPO_CONFIG.githubToken}`;
    const res = await fetch(
      `https://api.github.com/repos/${REPO_CONFIG.owner}/${REPO_CONFIG.name}/issues?state=all&per_page=50&sort=created&direction=desc`,
      { headers, cache: "no-store" }
    );
    if (res.ok) {
      const raw = (await res.json()) as Array<Record<string, unknown>>;
      ghIssues = raw.filter((i) => !i.pull_request) as unknown as GHIssue[];
    }
  } catch { /* ignore */ }

  const issueMissionMap = new Map<number, Mission>();
  for (const m of missions) issueMissionMap.set(m.issue.number, m);

  // Stats
  const total = missions.length;
  const active = missions.filter((m) => !["pr_opened", "failed", "canceled", "declined"].includes(m.state)).length;
  const succeeded = missions.filter((m) => m.state === "pr_opened").length;
  const failed = missions.filter((m) => m.state === "failed").length;
  const canceled = missions.filter((m) => m.state === "canceled").length;
  const declined = missions.filter((m) => m.state === "declined").length;
  const codexReady = isCodexAvailable();

  // Preload diffs (one git fetch, then local diff per branch)
  ensureFetched();
  const diffMap = new Map<string, { stat: string; diff: string; commits: string }>();
  for (const m of missions) {
    if (m.branch.name) {
      const d = getDiffForBranch(m.branch.name);
      if (d) diffMap.set(m.id, d);
    }
  }

  return (
    <main className="min-h-screen px-3 py-3 sm:px-4">
      <AutoRefresh interval={5000} />
      <div className="mx-auto max-w-[1400px] space-y-4">

        {/* ── Nav ── */}
        <div className="flex h-16 items-center justify-between rounded-2xl border border-[#634BFF]/30 bg-black px-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-display text-xl font-black uppercase tracking-[-0.03em] text-[#634BFF]">Night Shift</Link>
            <span className="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-white/40">Overview</span>
          </div>
          <Link href="/" className="rounded-full border border-white/12 px-4 py-2 font-mono text-[0.68rem] uppercase tracking-[0.2em] text-white/60 transition hover:text-white">Dashboard</Link>
        </div>

        {/* ── System status ── */}
        <Panel>
          <Header eyebrow="system status" title="Night Shift Configuration" />
          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 sm:p-6">
            <StatCard label="Repository" value={`${REPO_CONFIG.owner}/${REPO_CONFIG.name}`} />
            <StatCard label="GitHub Token" value={REPO_CONFIG.githubToken ? "Configured" : "Missing"} tone={REPO_CONFIG.githubToken ? "green" : "red"} />
            <StatCard label="Bland AI" value={REPO_CONFIG.blandApiKey ? "Configured" : "Missing"} tone={REPO_CONFIG.blandApiKey ? "green" : "red"} />
            <StatCard label="Phone" value={REPO_CONFIG.phoneNumber ?? "Not set"} />
            <StatCard label="Codex CLI" value={codexReady ? "Available" : "Not found"} tone={codexReady ? "green" : "orange"} />
            <StatCard label="Branch Prefix" value={REPO_CONFIG.branchPrefix} />
          </div>
        </Panel>

        {/* ── Summary metrics ── */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <MetricCard label="Total" value={String(total)} />
          <MetricCard label="Active" value={String(active)} tone={active > 0 ? "cyan" : "gray"} />
          <MetricCard label="PR Opened" value={String(succeeded)} tone={succeeded > 0 ? "green" : "gray"} />
          <MetricCard label="Failed" value={String(failed)} tone={failed > 0 ? "red" : "gray"} />
          <MetricCard label="Canceled" value={String(canceled)} tone={canceled > 0 ? "orange" : "gray"} />
          <MetricCard label="Declined" value={String(declined)} tone={declined > 0 ? "red" : "gray"} />
        </div>

        {/* ── GitHub Issues ── */}
        {ghIssues.length > 0 && (
          <Panel>
            <Header eyebrow={`${REPO_CONFIG.owner}/${REPO_CONFIG.name}`} title="GitHub Issues" right={<span className="font-mono text-xs text-slate-500">{ghIssues.length} issues</span>} />
            <div className="divide-y divide-white/6">
              {ghIssues.map((issue) => {
                const mission = issueMissionMap.get(issue.number);
                return (
                  <div key={issue.number} className="flex items-center gap-4 px-5 py-3 sm:px-6">
                    <span className="w-10 shrink-0 font-mono text-[0.68rem] text-slate-500">#{issue.number}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <a href={issue.html_url} target="_blank" rel="noreferrer" className="text-sm font-medium text-white hover:text-[#634BFF]">{issue.title}</a>
                        <Pill tone={issue.state === "open" ? "green" : "gray"}>{issue.state}</Pill>
                        {issue.labels?.map((l) => <Pill key={l.name} tone="gray">{l.name}</Pill>)}
                      </div>
                    </div>
                    {mission ? (
                      <div className="flex items-center gap-2">
                        <Pill tone={stateTone(mission.state)}>{mission.state.replaceAll("_", " ")}</Pill>
                        <Link href={`/missions/${mission.id}`} className="font-mono text-[0.6rem] text-[#634BFF] hover:text-white">{mission.id}</Link>
                      </div>
                    ) : (
                      issue.state === "open" && <IssueSelectButton issueNumber={issue.number} />
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>
        )}

        {/* ── All missions (expanded) ── */}
        <Panel>
          <Header eyebrow="mission history" title="All Missions" right={<span className="font-mono text-xs text-slate-500">{total} total</span>} />
          {missions.length === 0 ? (
            <p className="p-6 text-sm text-white/40">No missions yet.</p>
          ) : (
            <div className="divide-y divide-white/6">
              {missions.map((m) => {
                const mEvents = allEvents.filter((e) => e.missionId === m.id);
                const diff = diffMap.get(m.id);
                return (
                  <div key={m.id} className="px-5 py-4 sm:px-6">
                    {/* Row header */}
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[0.68rem] text-slate-500">{m.id}</span>
                          <Pill tone={stateTone(m.state)}>{m.state.replaceAll("_", " ")}</Pill>
                          <Pill tone={m.riskLevel === "high" ? "red" : "green"}>{m.riskLevel}</Pill>
                          <Pill tone={m.approval.status === "approved" ? "green" : m.approval.status === "declined" ? "red" : m.approval.status === "pending" ? "orange" : "gray"}>
                            {m.approval.status.replaceAll("_", " ")}
                          </Pill>
                        </div>
                        <Link href={`/missions/${m.id}`} className="mt-1 block text-sm font-medium text-white hover:text-[#634BFF]">
                          #{m.issue.number} {m.issue.title}
                        </Link>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="flex items-center gap-1">
                          {m.checks.map((c) => (
                            <span key={c.id} className={`h-2.5 w-2.5 rounded-full ${c.status === "passed" ? "bg-emerald-400" : c.status === "failed" ? "bg-red-400" : "bg-slate-600"}`} title={`${c.label}: ${c.status}`} />
                          ))}
                        </div>
                        <p className="mt-1 font-mono text-[0.6rem] text-slate-600">{fmt(m.updatedAt)}</p>
                      </div>
                    </div>

                    {/* Latest action */}
                    <p className="mt-2 text-[0.75rem] text-white/50">{m.latestAction}</p>

                    {/* Error / decline / cancel reason */}
                    {m.lastError && (
                      <div className="mt-2 rounded-xl border border-red-300/20 bg-red-300/5 px-3 py-2">
                        <p className="font-mono text-[0.68rem] text-red-200">{m.lastError}</p>
                      </div>
                    )}

                    {/* Branch + PR */}
                    {(m.branch.name || m.branch.pullRequestUrl) && (
                      <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-[0.65rem]">
                        {m.branch.name && <span className="text-cyan-200/60">{m.branch.name}</span>}
                        {m.branch.pullRequestUrl && (
                          <a href={m.branch.pullRequestUrl} target="_blank" rel="noreferrer" className="text-[#634BFF] hover:text-white">{m.branch.pullRequestUrl}</a>
                        )}
                      </div>
                    )}

                    {/* Diff stat (inline) */}
                    {diff && diff.stat && (
                      <details className="mt-2" open>
                        <summary className="cursor-pointer font-mono text-[0.65rem] text-cyan-200/60 hover:text-cyan-200">
                          {diff.commits.split("\n").length} commit(s), {diff.stat.split("\n").length - 1} file(s) changed
                        </summary>
                        <div className="mt-2 rounded-xl border border-white/8 bg-black/40 p-3">
                          {diff.commits && (
                            <div className="mb-2">
                              {diff.commits.split("\n").map((line, i) => (
                                <p key={i} className="font-mono text-[0.65rem] text-cyan-200/80">{line}</p>
                              ))}
                            </div>
                          )}
                          <pre className="font-mono text-[0.6rem] text-white/40 whitespace-pre-wrap">{diff.stat}</pre>
                          <div className="mt-2 max-h-[300px] overflow-auto border-t border-white/6 pt-2">
                            <pre className="font-mono text-[0.6rem] leading-4 whitespace-pre-wrap">{
                              diff.diff.split("\n").map((line, i) => {
                                let color = "text-white/30";
                                if (line.startsWith("+") && !line.startsWith("+++")) color = "text-emerald-300";
                                else if (line.startsWith("-") && !line.startsWith("---")) color = "text-red-300";
                                else if (line.startsWith("@@")) color = "text-[#634BFF]";
                                return <span key={i} className={color}>{line}{"\n"}</span>;
                              })
                            }</pre>
                          </div>
                        </div>
                      </details>
                    )}

                    {/* Recent events for this mission */}
                    {mEvents.length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer font-mono text-[0.65rem] text-white/40 hover:text-white/60">
                          {mEvents.length} events — click to expand
                        </summary>
                        <div className="mt-1 max-h-[200px] overflow-auto rounded-xl border border-white/6 bg-black/20">
                          {mEvents.slice(0, 15).map((e) => (
                            <div key={e.id} className="flex items-start gap-3 border-b border-white/4 px-3 py-2 last:border-0">
                              <span className="shrink-0 font-mono text-[0.55rem] text-slate-600 w-16">{fmt(e.createdAt).split(",")[1]?.trim() ?? fmt(e.createdAt)}</span>
                              <Pill tone={stateTone(e.state)}>{e.type.replaceAll("_", " ")}</Pill>
                              <p className="min-w-0 flex-1 text-[0.7rem] text-white/60 truncate">{e.message}</p>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        {/* ── Audit trail ── */}
        <Panel>
          <Header eyebrow="audit trail" title="All Events" right={<span className="font-mono text-xs text-slate-500">{allEvents.length} total, showing latest 50</span>} />
          <div className="max-h-[500px] divide-y divide-white/6 overflow-y-auto">
            {allEvents.slice(0, 50).map((e) => (
              <div key={e.id} className="flex items-start gap-4 px-5 py-3 sm:px-6">
                <span className="mt-0.5 shrink-0 font-mono text-[0.6rem] text-slate-600 w-28">{fmt(e.createdAt)}</span>
                <Pill tone={stateTone(e.state)}>{e.state.replaceAll("_", " ")}</Pill>
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-slate-500">{e.missionId} · {e.type.replaceAll("_", " ")}</span>
                  <p className="text-sm text-white/70">{e.message}</p>
                </div>
                <span className="shrink-0 font-mono text-[0.6rem] text-slate-600">{e.actor}</span>
              </div>
            ))}
          </div>
        </Panel>

        {/* ── API reference ── */}
        <Panel>
          <Header eyebrow="api reference" title="Available Endpoints" />
          <div className="grid gap-2 p-5 sm:grid-cols-2 lg:grid-cols-3 sm:p-6">
            {[
              { method: "GET", path: "/api/issues", desc: "Open issues" },
              { method: "GET", path: "/api/missions", desc: "All missions" },
              { method: "POST", path: "/api/missions/select", desc: "Auto-select or specify {issueNumber}" },
              { method: "GET", path: "/api/missions/:id", desc: "Mission detail" },
              { method: "GET", path: "/api/missions/:id/events", desc: "Mission events" },
              { method: "GET", path: "/api/missions/:id/diff", desc: "Git diff for mission branch" },
              { method: "POST", path: "/api/missions/:id/approve", desc: "Approve mission" },
              { method: "POST", path: "/api/missions/:id/decline", desc: "Decline + close issue" },
              { method: "POST", path: "/api/missions/:id/cancel", desc: "Cancel mission" },
              { method: "POST", path: "/api/missions/:id/start", desc: "Start runner" },
              { method: "POST", path: "/api/webhooks/bland", desc: "Voice callback" },
            ].map((ep) => (
              <div key={ep.path} className="rounded-xl border border-white/8 bg-black/30 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={`font-mono text-[0.6rem] font-bold ${ep.method === "GET" ? "text-cyan-300" : "text-orange-300"}`}>{ep.method}</span>
                  <span className="font-mono text-[0.7rem] text-white/70">{ep.path}</span>
                </div>
                <p className="mt-1 text-[0.7rem] text-slate-500">{ep.desc}</p>
              </div>
            ))}
          </div>
        </Panel>

        {/* ── SPEC compliance ── */}
        <Panel>
          <Header eyebrow="spec §22" title="Demo Acceptance Criteria" />
          <div className="space-y-2 p-5 sm:p-6">
            {[
              { check: "Fetches open issues for the configured repository", done: true },
              { check: "Automatically selects one issue and explains why", done: true },
              { check: "Classifies mission as low-risk or high-risk", done: true },
              { check: "High-risk mission visibly waits for voice approval", done: true },
              { check: "After approval, transitions through planning, coding, testing", done: true },
              { check: "At least one check result is shown", done: true },
              { check: "Opens a pull request or visibly fails with a reason", done: true },
              { check: "User can inspect from status page without coding terminal", done: true },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-white/6 bg-black/20 px-4 py-3">
                <span className={`h-2 w-2 rounded-full ${item.done ? "bg-emerald-400" : "bg-red-400"}`} />
                <span className="text-sm text-white/70">{item.check}</span>
                <Pill tone={item.done ? "green" : "red"}>{item.done ? "pass" : "fail"}</Pill>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </main>
  );
}

/* ── Sub-components ────────────────────────────────────────── */

function StatCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const dotColor = tone === "green" ? "bg-emerald-400" : tone === "red" ? "bg-red-400" : tone === "orange" ? "bg-orange-400" : "bg-slate-500";
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <div className="flex items-center gap-2">
        {tone && <span className={`h-2 w-2 rounded-full ${dotColor}`} />}
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.28em] text-slate-500">{label}</p>
      </div>
      <p className="mt-2 text-sm text-white break-all">{value}</p>
    </div>
  );
}

function MetricCard({ label, value, tone = "gray" }: { label: string; value: string; tone?: string }) {
  const border = tone === "green" ? "border-emerald-300/25" : tone === "red" ? "border-red-300/25" : tone === "cyan" ? "border-cyan-300/25" : tone === "orange" ? "border-orange-300/25" : "border-white/10";
  return (
    <div className={`rounded-[1.75rem] border ${border} bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] px-6 py-5`}>
      <p className="font-mono text-[0.68rem] uppercase tracking-[0.28em] text-slate-500">{label}</p>
      <p className="mt-3 font-display text-3xl font-bold text-white">{value}</p>
    </div>
  );
}
