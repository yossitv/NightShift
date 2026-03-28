import Link from "next/link";
import { listMissionEvents, listMissions } from "@/src/lib/nightshift/store";
import { MissionActions, AutoRefresh, LiveIssueList } from "./components/MissionActions";

export const dynamic = "force-dynamic";

/* ── DeepOps-style primitives ──────────────────────────────── */

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

/* ── Pipeline stages visualization ─────────────────────────── */

const PIPELINE = [
  { key: "candidate_selected", label: "Selected", color: "#634BFF" },
  { key: "awaiting_approval", label: "Approval", color: "#FF9900" },
  { key: "queued", label: "Queued", color: "#634BFF" },
  { key: "planning", label: "Planning", color: "#00B4D8" },
  { key: "coding", label: "Coding", color: "#00B4D8" },
  { key: "testing", label: "Testing", color: "#EB5424" },
  { key: "pr_opened", label: "PR Opened", color: "#10B981" },
] as const;

function PipelineBar({ current }: { current: string }) {
  const idx = PIPELINE.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center gap-1 overflow-x-auto py-2">
      {PIPELINE.map((stage, i) => {
        const active = i <= idx && idx >= 0;
        return (
          <div key={stage.key} className="flex items-center gap-1">
            <div
              className="h-2 w-12 rounded-full transition-colors sm:w-16"
              style={{ backgroundColor: active ? stage.color : "rgba(255,255,255,0.08)" }}
            />
            <span className={`hidden font-mono text-[0.6rem] uppercase tracking-[0.16em] sm:inline ${active ? "text-white/70" : "text-white/25"}`}>
              {stage.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────── */

export default async function Home() {
  const allMissions = await listMissions();
  const activeStates = ["candidate_selected", "awaiting_approval", "queued", "planning", "coding", "testing", "retrying"];
  const activeMission = allMissions.find((m) => activeStates.includes(m.state)) ?? null;
  const recentMissions = allMissions.slice(0, 10);
  const activeEvents = activeMission ? (await listMissionEvents(activeMission.id)).slice(0, 8) : [];

  return (
    <main className="min-h-screen px-3 py-3 sm:px-4">
      <AutoRefresh interval={5000} />

      <div className="mx-auto max-w-[1400px] space-y-4">
        {/* ── Header bar ── */}
        <div className="flex h-16 items-center justify-between rounded-2xl border border-[#634BFF]/30 bg-black px-6">
          <div className="font-display text-xl font-black uppercase tracking-[-0.03em] text-[#634BFF]">
            Night Shift
          </div>
          {activeMission && (
            <div className="hidden items-center gap-4 md:flex">
              <PipelineBar current={activeMission.state} />
            </div>
          )}
          <div className="flex items-center gap-3">
            <Link
              href="/overview"
              className="rounded-full border border-white/12 px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-white/50 transition hover:text-white"
            >
              Overview
            </Link>
            {activeMission && (
              <>
                <Pill tone={stateTone(activeMission.state)}>{activeMission.state.replaceAll("_", " ")}</Pill>
                <Pill tone={activeMission.riskLevel === "high" ? "red" : "green"}>{activeMission.riskLevel} risk</Pill>
              </>
            )}
          </div>
        </div>

        {/* ── Two-column layout ── */}
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          {/* ── Left: Live Issues ── */}
          <div className="space-y-4">
            <LiveIssueList interval={5000} />
          </div>

          {/* ── Right: Mission Status ── */}
          <div className="space-y-4">
            {/* Active mission */}
            {activeMission ? (
              <>
                <Panel>
                  <SectionHeader
                    eyebrow="active mission"
                    title={activeMission.issue.title}
                    right={
                      <Link
                        href={`/missions/${activeMission.id}`}
                        className="rounded-full border border-white/12 px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-white/50 transition hover:text-white"
                      >
                        Detail
                      </Link>
                    }
                  />
                  <div className="px-5 py-5 sm:px-6 space-y-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-slate-500">#{activeMission.issue.number}</span>
                      <Pill tone={stateTone(activeMission.state)}>{activeMission.state.replaceAll("_", " ")}</Pill>
                      <Pill tone={activeMission.riskLevel === "high" ? "red" : "green"}>{activeMission.riskLevel} risk</Pill>
                      <Pill tone="gray">{activeMission.approval.status.replaceAll("_", " ")}</Pill>
                    </div>
                    <p className="text-sm leading-6 text-white/60">{activeMission.summary.slice(0, 200)}</p>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Metric label="Mission ID" value={activeMission.id} />
                      <Metric label="Updated" value={fmt(activeMission.updatedAt)} />
                      <Metric label="Branch" value={activeMission.branch.name ?? "—"} />
                      <Metric label="Retries" value={`${activeMission.retryCount} / ${activeMission.maxRetries}`} />
                      {activeMission.branch.pullRequestUrl && (
                        <Metric label="PR" value={activeMission.branch.pullRequestUrl} />
                      )}
                      {activeMission.lastError && (
                        <Metric label="Last error" value={activeMission.lastError} />
                      )}
                    </div>

                    {/* Checks */}
                    {activeMission.checks.length > 0 && (
                      <div className="space-y-2">
                        <p className="font-mono text-[0.68rem] uppercase tracking-[0.28em] text-slate-500">
                          Checks {activeMission.checks.filter((c) => c.status === "passed").length}/{activeMission.checks.length}
                        </p>
                        <div className="flex gap-2 flex-wrap">
                          {activeMission.checks.map((check) => (
                            <Pill key={check.id} tone={check.status === "passed" ? "green" : check.status === "failed" ? "red" : "gray"}>
                              {check.label}: {check.status}
                            </Pill>
                          ))}
                        </div>
                      </div>
                    )}

                    <MissionActions missionId={activeMission.id} state={activeMission.state} />
                  </div>
                </Panel>

                {/* Event log */}
                {activeEvents.length > 0 && (
                  <Panel>
                    <SectionHeader eyebrow="mission log" title="Events" right={<span className="font-mono text-xs text-slate-500">{activeEvents.length}</span>} />
                    <div className="space-y-px max-h-[400px] overflow-y-auto">
                      {activeEvents.map((event) => (
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
              </>
            ) : (
              <Panel>
                <div className="px-6 py-8 text-center">
                  <p className="font-mono text-[0.72rem] uppercase tracking-[0.34em] text-white/30">No active mission</p>
                  <p className="mt-2 text-sm text-white/50">Watcher is monitoring for new issues every 30s.</p>
                  <div className="mt-4">
                    <MissionActions missionId={null} state={null} />
                  </div>
                </div>
              </Panel>
            )}

            {/* Mission history */}
            {recentMissions.length > 0 && (
              <Panel>
                <SectionHeader eyebrow="history" title="Recent Missions" right={<span className="font-mono text-xs text-slate-500">{recentMissions.length}</span>} />
                <div className="space-y-px max-h-[300px] overflow-y-auto">
                  {recentMissions.map((m) => (
                    <Link
                      key={m.id}
                      href={`/missions/${m.id}`}
                      className="flex items-center justify-between gap-3 border-b border-white/6 px-5 py-3 last:border-b-0 sm:px-6 hover:bg-white/[0.02] transition"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="font-mono text-xs text-slate-500">#{m.issue.number}</span>
                        <span className="text-sm text-white/80 truncate">{m.issue.title}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Pill tone={stateTone(m.state)}>{m.state.replaceAll("_", " ")}</Pill>
                        <span className="font-mono text-[0.6rem] text-slate-600">{fmt(m.updatedAt)}</span>
                      </div>
                    </Link>
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
