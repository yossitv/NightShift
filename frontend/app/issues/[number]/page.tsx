import Link from "next/link";
import { notFound } from "next/navigation";
import { REPO_CONFIG } from "@/lib/config";
import { classifyRisk } from "@/lib/selector";
import { getPendingQueue } from "@/lib/issue-notifier";
import { listMissions, listMissionEvents } from "@/src/lib/nightshift/store";
import { AutoRefresh, MissionActions } from "../../components/MissionActions";
import type { GitHubIssue } from "@/lib/types";

export const dynamic = "force-dynamic";

/* ── Primitives ─────────────────────────────────────────────── */

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

export default async function IssuePage({ params }: { params: Promise<{ number: string }> }) {
  const { number: numStr } = await params;
  const issueNumber = parseInt(numStr, 10);
  if (isNaN(issueNumber)) notFound();

  // Fetch issue from GitHub
  const { owner, name, githubToken } = REPO_CONFIG;
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (githubToken) headers.Authorization = `Bearer ${githubToken}`;

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${name}/issues/${issueNumber}`,
    { headers, next: { revalidate: 0 } }
  );
  if (!res.ok) notFound();

  const issue = (await res.json()) as GitHubIssue & {
    state: string;
    user?: { login: string; avatar_url: string };
    comments: number;
  };

  // Risk classification
  const risk = classifyRisk(issue);

  // Pending call status
  const pendingQueue = getPendingQueue();
  const pendingEntry = pendingQueue.find((p) => p.issue.number === issueNumber);

  // Related missions
  const allMissions = await listMissions();
  const relatedMissions = allMissions.filter((m) => m.issue.number === issueNumber);
  const activeMission = relatedMissions.find((m) =>
    ["candidate_selected", "awaiting_approval", "queued", "planning", "coding", "testing", "retrying"].includes(m.state)
  );
  const latestMission = relatedMissions[0] ?? null;

  // Events for the active or latest mission
  const targetMission = activeMission ?? latestMission;
  const events = targetMission ? (await listMissionEvents(targetMission.id)).slice(0, 10) : [];

  return (
    <main className="min-h-screen px-3 py-3 sm:px-4">
      <AutoRefresh interval={5000} />
      <div className="mx-auto max-w-[1200px] space-y-4">

        {/* ── Header ── */}
        <Panel className="overflow-hidden">
          <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(99,75,255,0.12),transparent_40%)] px-6 py-6 sm:px-8 sm:py-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="font-mono text-[0.7rem] uppercase tracking-[0.32em] text-[#8B7CFF]">
                  Issue #{issueNumber} · {owner}/{name}
                </p>
                <h1 className="font-display text-2xl font-bold tracking-[-0.04em] text-white sm:text-4xl">
                  {issue.title}
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={issue.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-white/12 px-4 py-2 font-mono text-[0.72rem] uppercase tracking-[0.2em] text-white/50 transition hover:text-white"
                >
                  GitHub
                </a>
                <Link
                  href="/"
                  className="rounded-full border border-white/12 px-4 py-2 font-mono text-[0.72rem] uppercase tracking-[0.2em] text-white/70 transition hover:border-white/24 hover:text-white"
                >
                  Dashboard
                </Link>
              </div>
            </div>

            {/* Badges */}
            <div className="mt-4 flex flex-wrap gap-2">
              <Pill tone={issue.state === "open" ? "green" : "red"}>{issue.state}</Pill>
              <Pill tone={risk.level === "high" ? "red" : "green"}>{risk.level} risk</Pill>
              {pendingEntry && (
                <Pill tone={
                  pendingEntry.decision === "pending" ? "orange" :
                  pendingEntry.decision === "approved" ? "green" :
                  pendingEntry.decision === "declined" ? "red" : "gray"
                }>
                  Call: {pendingEntry.decision}
                </Pill>
              )}
              {activeMission && (
                <Pill tone={stateTone(activeMission.state)}>
                  Mission: {activeMission.state.replaceAll("_", " ")}
                </Pill>
              )}
              {issue.labels?.map((l) => (
                <Pill key={l.name} tone="gray">{l.name}</Pill>
              ))}
            </div>
          </div>
        </Panel>

        {/* ── Two columns ── */}
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          {/* Left */}
          <div className="space-y-4">
            {/* Issue body */}
            <Panel>
              <SectionHeader eyebrow="description" title="Issue Body" />
              <div className="px-5 py-5 sm:px-6">
                {issue.body ? (
                  <div className="prose prose-invert prose-sm max-w-none text-white/70 whitespace-pre-wrap break-words">
                    {issue.body}
                  </div>
                ) : (
                  <p className="text-sm text-white/30 italic">No description provided.</p>
                )}
              </div>
            </Panel>

            {/* Risk analysis */}
            <Panel>
              <SectionHeader eyebrow="analysis" title="Risk Classification" />
              <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
                <Metric label="Risk Level" value={risk.level.toUpperCase()} />
                <Metric label="Reason" value={risk.note} />
              </div>
            </Panel>

            {/* Voice call status */}
            <Panel>
              <SectionHeader
                eyebrow="voice approval"
                title="Phone Call Status"
                right={
                  pendingEntry?.decision === "pending" ? (
                    <span className="flex items-center gap-1.5">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-400" />
                      </span>
                      <span className="font-mono text-xs text-orange-200">Calling...</span>
                    </span>
                  ) : undefined
                }
              />
              <div className="p-5 sm:p-6">
                {pendingEntry ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Metric label="Decision" value={pendingEntry.decision} />
                    <Metric label="Call ID" value={pendingEntry.callId ?? "—"} />
                    <Metric label="Detected At" value={fmt(pendingEntry.detectedAt)} />
                    <Metric label="Risk Note" value={pendingEntry.riskNote} />
                  </div>
                ) : activeMission?.approval?.channel === "voice" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Metric label="Decision" value={activeMission.approval.status.replaceAll("_", " ")} />
                    <Metric label="Channel" value={activeMission.approval.channel} />
                    <Metric label="Requested" value={fmt(activeMission.approval.requestedAt)} />
                    <Metric label="Resolved" value={fmt(activeMission.approval.resolvedAt)} />
                  </div>
                ) : risk.level === "high" ? (
                  <p className="text-sm text-white/40">Awaiting watcher detection. Phone call will be placed automatically.</p>
                ) : (
                  <p className="text-sm text-white/40">Low-risk issue. No phone call required.</p>
                )}
              </div>
            </Panel>
          </div>

          {/* Right */}
          <div className="space-y-4">
            {/* Mission status */}
            <Panel>
              <SectionHeader
                eyebrow="mission"
                title={targetMission ? `Mission ${targetMission.id}` : "No Mission"}
                right={
                  targetMission ? (
                    <Link
                      href={`/missions/${targetMission.id}`}
                      className="font-mono text-xs text-[#634BFF] hover:text-[#8B7CFF]"
                    >
                      Full Detail
                    </Link>
                  ) : undefined
                }
              />
              {targetMission ? (
                <div className="p-5 sm:p-6 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Pill tone={stateTone(targetMission.state)}>{targetMission.state.replaceAll("_", " ")}</Pill>
                    <Pill tone={targetMission.riskLevel === "high" ? "red" : "green"}>{targetMission.riskLevel} risk</Pill>
                  </div>
                  <div className="grid gap-3">
                    <Metric label="State" value={targetMission.state.replaceAll("_", " ")} />
                    <Metric label="Branch" value={targetMission.branch.name ?? "—"} />
                    <Metric label="PR" value={targetMission.branch.pullRequestUrl ?? "—"} />
                    <Metric label="Retries" value={`${targetMission.retryCount} / ${targetMission.maxRetries}`} />
                    <Metric label="Updated" value={fmt(targetMission.updatedAt)} />
                    {targetMission.lastError && <Metric label="Error" value={targetMission.lastError} />}
                  </div>

                  {/* Checks */}
                  {targetMission.checks.length > 0 && (
                    <div className="space-y-2">
                      <p className="font-mono text-[0.68rem] uppercase tracking-[0.28em] text-slate-500">Checks</p>
                      {targetMission.checks.map((check) => (
                        <div key={check.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm text-white">{check.label}</span>
                            <Pill tone={check.status === "passed" ? "green" : check.status === "failed" ? "red" : "gray"}>
                              {check.status}
                            </Pill>
                          </div>
                          <p className="mt-1 text-[0.72rem] text-white/50">{check.summary}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <MissionActions missionId={targetMission.id} state={targetMission.state} />
                </div>
              ) : (
                <div className="p-5 sm:p-6 text-center space-y-3">
                  <p className="text-sm text-white/40">No mission created for this issue yet.</p>
                  <MissionActions missionId={null} state={null} />
                </div>
              )}
            </Panel>

            {/* Mission history for this issue */}
            {relatedMissions.length > 1 && (
              <Panel>
                <SectionHeader eyebrow="history" title="Past Missions" right={<span className="font-mono text-xs text-slate-500">{relatedMissions.length}</span>} />
                <div className="space-y-px">
                  {relatedMissions.map((m) => (
                    <Link
                      key={m.id}
                      href={`/missions/${m.id}`}
                      className="flex items-center justify-between gap-3 border-b border-white/6 px-5 py-3 last:border-b-0 sm:px-6 hover:bg-white/[0.02] transition"
                    >
                      <span className="font-mono text-xs text-slate-500">{m.id}</span>
                      <div className="flex items-center gap-2">
                        <Pill tone={stateTone(m.state)}>{m.state.replaceAll("_", " ")}</Pill>
                        <span className="font-mono text-[0.6rem] text-slate-600">{fmt(m.updatedAt)}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </Panel>
            )}

            {/* Event log */}
            {events.length > 0 && (
              <Panel>
                <SectionHeader eyebrow="log" title="Events" right={<span className="font-mono text-xs text-slate-500">{events.length}</span>} />
                <div className="space-y-px max-h-[400px] overflow-y-auto">
                  {events.map((event) => (
                    <div key={event.id} className="flex items-start gap-3 border-b border-white/6 px-5 py-3 last:border-b-0 sm:px-6">
                      <Pill tone={stateTone(event.state)}>{event.state.replaceAll("_", " ")}</Pill>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white/80">{event.message}</p>
                        <p className="mt-1 font-mono text-[0.6rem] text-slate-600">
                          {fmt(event.createdAt)} · {event.actor.replaceAll("_", " ")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
