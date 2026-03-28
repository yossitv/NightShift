import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh, MissionActions } from "../../components/MissionActions";
import { getMission, listMissionEvents } from "@/src/lib/nightshift/store";
import { execSync } from "child_process";
import { join } from "path";
import { existsSync } from "fs";
import { REPO_CONFIG } from "@/lib/config";

export const dynamic = "force-dynamic";

/* ── Primitives (DeepOps style) ────────────────────────────── */

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-[1.75rem] border border-white/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] shadow-[0_0_0_1px_rgba(0,212,255,0.05)] ${className}`}>
      {children}
    </section>
  );
}

function SectionHeader({ eyebrow, title, right }: { eyebrow: string; title: string; right?: React.ReactNode }) {
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

function Pill({ tone = "gray", children }: { tone?: "cyan" | "green" | "orange" | "red" | "gray" | "purple"; children: React.ReactNode }) {
  const colors = {
    cyan: "border-cyan-300/35 bg-cyan-300/10 text-cyan-100",
    green: "border-emerald-300/35 bg-emerald-300/10 text-emerald-100",
    orange: "border-orange-300/35 bg-orange-300/10 text-orange-100",
    red: "border-red-300/35 bg-red-300/10 text-red-100",
    gray: "border-white/15 bg-white/5 text-slate-200",
    purple: "border-[#634BFF]/35 bg-[#634BFF]/10 text-[#a594ff]",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[0.68rem] uppercase tracking-[0.2em] ${colors[tone]}`}>
      {children}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <p className="font-mono text-[0.68rem] uppercase tracking-[0.28em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm text-white break-all">{value}</p>
    </div>
  );
}

function stateTone(s: string): "cyan" | "green" | "orange" | "red" | "gray" | "purple" {
  if (s === "pr_opened") return "green";
  if (s === "failed" || s === "declined" || s === "canceled") return "red";
  if (s === "awaiting_approval" || s === "retrying") return "orange";
  if (s === "planning" || s === "coding" || s === "testing") return "cyan";
  if (s === "queued" || s === "candidate_selected") return "purple";
  return "gray";
}

function fmt(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

/* ── Page ───────────────────────────────────────────────────── */

export default async function MissionPage({ params }: { params: Promise<{ missionId: string }> }) {
  const { missionId } = await params;
  const mission = await getMission(missionId);
  if (!mission) notFound();

  const events = (await listMissionEvents(mission.id)).slice(0, 12);
  const passedChecks = mission.checks.filter((c) => c.status === "passed").length;

  // Fetch diff if branch exists (no checkout — use branch ref directly)
  let diffData: { stat: string; diff: string; commits: string } | null = null;
  const repoPath = join(process.cwd(), "..", "dev-app");
  if (mission.branch.name && existsSync(join(repoPath, ".git"))) {
    try {
      const branch = mission.branch.name;
      const run = (cmd: string) => execSync(cmd, { cwd: repoPath, encoding: "utf-8", timeout: 5000 }).trim();
      const stat = run(`git diff --stat origin/main...${branch} 2>/dev/null || echo ''`);
      const diff = run(`git diff origin/main...${branch} 2>/dev/null || echo ''`);
      const commits = run(`git log --oneline origin/main...${branch} 2>/dev/null || echo ''`);
      if (stat || diff) diffData = { stat, diff: diff.slice(0, 30000), commits };
    } catch { /* ignore */ }
  }

  return (
    <main className="min-h-screen px-3 py-3 sm:px-4">
      <AutoRefresh interval={3000} />
      <div className="mx-auto max-w-[1200px] space-y-4">

        {/* ── Hero ── */}
        <Panel className="overflow-hidden">
          <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(99,75,255,0.12),transparent_40%)] px-6 py-6 sm:px-8 sm:py-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="font-mono text-[0.7rem] uppercase tracking-[0.32em] text-[#8B7CFF]">Night Shift Mission</p>
                <h1 className="font-display text-2xl font-bold tracking-[-0.04em] text-white sm:text-4xl">
                  {mission.issue.title}
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/overview"
                  className="rounded-full border border-white/12 px-4 py-2 font-mono text-[0.72rem] uppercase tracking-[0.2em] text-white/50 transition hover:text-white"
                >
                  Overview
                </Link>
                <Link
                  href="/"
                  className="rounded-full border border-white/12 px-4 py-2 font-mono text-[0.72rem] uppercase tracking-[0.2em] text-white/70 transition hover:border-white/24 hover:text-white"
                >
                  Dashboard
                </Link>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Pill tone={mission.riskLevel === "high" ? "red" : "green"}>{mission.riskLevel} risk</Pill>
              <Pill tone={stateTone(mission.state)}>{mission.state.replaceAll("_", " ")}</Pill>
              <Pill tone={mission.approval.status === "approved" ? "green" : mission.approval.status === "pending" ? "orange" : "gray"}>
                {mission.approval.status.replaceAll("_", " ")}
              </Pill>
            </div>

            <p className="mt-4 max-w-3xl text-base leading-7 text-white/60">{mission.summary}</p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Issue" value={`#${mission.issue.number}`} />
              <Metric label="Retry count" value={String(mission.retryCount)} />
              <Metric label="Branch" value={mission.branch.name ?? "Pending"} />
              <Metric label="PR URL" value={mission.branch.pullRequestUrl ?? "Pending"} />
            </div>

            <div className="mt-5">
              <MissionActions missionId={mission.id} state={mission.state} />
            </div>
          </div>
        </Panel>

        {/* ── Content ── */}
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            {/* Selection */}
            <Panel>
              <SectionHeader
                eyebrow="issue selection"
                title="Selection rationale"
                right={
                  <a href={mission.issue.url ?? "#"} target="_blank" rel="noreferrer" className="font-mono text-xs text-[#634BFF] hover:text-[#8B7CFF]">
                    View issue
                  </a>
                }
              />
              <div className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6">
                <Metric label="Why selected" value={mission.selection.rationale} />
                <Metric label="Why now" value={mission.selection.whyNow} />
                <Metric label="Risk note" value={mission.selection.riskNote} />
              </div>
            </Panel>

            {/* Event log */}
            <Panel>
              <SectionHeader eyebrow="mission log" title="Recent events" right={<span className="font-mono text-xs text-slate-500">{events.length} events</span>} />
              <div className="space-y-px max-h-[500px] overflow-y-auto">
                {events.map((event) => (
                  <div key={event.id} className="flex items-start gap-4 border-b border-white/6 px-5 py-4 last:border-b-0 sm:px-6">
                    <Pill tone={stateTone(event.state)}>{event.state.replaceAll("_", " ")}</Pill>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white/80">{event.message}</p>
                      <p className="mt-1 font-mono text-[0.65rem] text-slate-500">
                        {fmt(event.createdAt)} · {event.actor.replaceAll("_", " ")} · {event.type.replaceAll("_", " ")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div className="space-y-4">
            {/* Approval */}
            <Panel>
              <SectionHeader eyebrow="approval gate" title="Approval & execution" />
              <div className="grid gap-3 p-5 sm:p-6">
                <Metric label="Approval status" value={mission.approval.status.replaceAll("_", " ")} />
                <Metric label="Channel" value={mission.approval.channel} />
                <Metric label="Requested" value={fmt(mission.approval.requestedAt)} />
                <Metric label="Resolved" value={fmt(mission.approval.resolvedAt)} />
                <Metric label="Current state" value={mission.state.replaceAll("_", " ")} />
                <Metric label="Latest action" value={mission.latestAction} />
                <Metric label="Max retries" value={String(mission.maxRetries)} />
                {mission.lastError && <Metric label="Last error" value={mission.lastError} />}
                {mission.traceUrl && <Metric label="Trace link" value={mission.traceUrl} />}
                {mission.logUrl && <Metric label="Log link" value={mission.logUrl} />}
              </div>
            </Panel>

            {/* Checks */}
            <Panel>
              <SectionHeader eyebrow="evaluation" title="Checks" right={<span className="font-mono text-xs text-slate-500">{passedChecks}/{mission.checks.length} passed</span>} />
              <div className="space-y-3 p-5 sm:p-6">
                {mission.checks.map((check) => (
                  <div key={check.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-white">{check.label}</p>
                      <Pill tone={check.status === "passed" ? "green" : check.status === "failed" ? "red" : "gray"}>
                        {check.status}
                      </Pill>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-white/55">{check.summary}</p>
                    <p className="mt-2 font-mono text-[0.6rem] text-slate-600">
                      {fmt(check.startedAt)} → {fmt(check.completedAt)}
                    </p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>

        {/* ── Diff viewer (full width) ── */}
        {diffData && (
          <Panel>
            <SectionHeader
              eyebrow="code changes"
              title="Git Diff"
              right={<span className="font-mono text-xs text-slate-500">{mission.branch.name}</span>}
            />
            {diffData.commits && (
              <div className="border-b border-white/6 px-5 py-3 sm:px-6">
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.28em] text-slate-500 mb-2">Commits</p>
                {diffData.commits.split("\n").map((line, i) => (
                  <p key={i} className="font-mono text-[0.72rem] text-cyan-200/80">{line}</p>
                ))}
              </div>
            )}
            {diffData.stat && (
              <div className="border-b border-white/6 px-5 py-3 sm:px-6">
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.28em] text-slate-500 mb-2">Stat</p>
                <pre className="font-mono text-[0.72rem] text-white/60 whitespace-pre-wrap">{diffData.stat}</pre>
              </div>
            )}
            <div className="max-h-[600px] overflow-auto px-5 py-3 sm:px-6">
              <pre className="font-mono text-[0.68rem] leading-5 whitespace-pre-wrap">
                {diffData.diff.split("\n").map((line, i) => {
                  let color = "text-white/40";
                  if (line.startsWith("+") && !line.startsWith("+++")) color = "text-emerald-300";
                  else if (line.startsWith("-") && !line.startsWith("---")) color = "text-red-300";
                  else if (line.startsWith("@@")) color = "text-[#634BFF]";
                  else if (line.startsWith("diff ") || line.startsWith("index ")) color = "text-slate-500";
                  return <span key={i} className={color}>{line}{"\n"}</span>;
                })}
              </pre>
            </div>
          </Panel>
        )}

        {!diffData && mission.branch.name && (
          <Panel>
            <SectionHeader eyebrow="code changes" title="Git Diff" />
            <p className="p-6 text-sm text-white/40">No diff available yet. The runner may still be coding.</p>
          </Panel>
        )}
      </div>
    </main>
  );
}
