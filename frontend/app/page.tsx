import Link from "next/link";
import { listMissionEvents, listMissions } from "@/src/lib/nightshift/store";
import { MissionActions, AutoRefresh } from "./components/MissionActions";

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
  const missions = await listMissions();
  const mission = missions[0] ?? null;
  const events = mission ? (await listMissionEvents(mission.id)).slice(0, 8) : [];

  if (!mission) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 py-24">
        <div className="max-w-xl rounded-[2rem] border border-white/10 bg-white/[0.03] p-10 text-center">
          <div className="mb-4 inline-flex items-center gap-3 rounded-full border border-[#634BFF]/25 bg-[#634BFF]/6 px-5 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#634BFF]" />
            <span className="font-mono text-[0.72rem] uppercase tracking-[0.38em] text-[#8B7CFF]">Night Shift</span>
          </div>
          <h1 className="mt-4 font-display text-4xl font-bold">No active mission.</h1>
          <p className="mt-4 text-base leading-7 text-white/60">
            Select an issue from the configured repository to start a new autonomous mission.
          </p>
          <div className="mt-8">
            <MissionActions missionId={null} state={null} />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-3 py-3 sm:px-4">
      <AutoRefresh interval={3000} />

      <div className="mx-auto max-w-[1400px] space-y-4">
        {/* ── Header bar ── */}
        <div className="flex h-16 items-center justify-between rounded-2xl border border-[#634BFF]/30 bg-black px-6">
          <div className="font-display text-xl font-black uppercase tracking-[-0.03em] text-[#634BFF]">
            Night Shift
          </div>
          <div className="hidden items-center gap-4 md:flex">
            <PipelineBar current={mission.state} />
          </div>
          <div className="flex items-center gap-3">
            <Pill tone={stateTone(mission.state)}>{mission.state.replaceAll("_", " ")}</Pill>
            <Pill tone={mission.riskLevel === "high" ? "red" : "green"}>{mission.riskLevel} risk</Pill>
          </div>
        </div>

        {/* ── Hero section ── */}
        <Panel>
          <div className="px-6 py-6 sm:px-8 sm:py-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-3">
                <p className="font-mono text-[0.72rem] uppercase tracking-[0.34em] text-white/42">
                  #{mission.issue.number} · {mission.issue.owner}/{mission.issue.repo}
                </p>
                <h1 className="font-display text-3xl font-bold tracking-[-0.04em] text-white sm:text-5xl">
                  {mission.issue.title}
                </h1>
                <p className="max-w-3xl text-base leading-7 text-white/60">{mission.summary}</p>
              </div>
              <Link
                href={`/missions/${mission.id}`}
                className="rounded-full border border-white/12 px-4 py-2 font-mono text-[0.72rem] uppercase tracking-[0.2em] text-white/70 transition hover:border-white/24 hover:text-white"
              >
                Detail View
              </Link>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Mission ID" value={mission.id} />
              <Metric label="Approval" value={mission.approval.status.replaceAll("_", " ")} />
              <Metric label="Retry count" value={String(mission.retryCount)} />
              <Metric label="Updated" value={fmt(mission.updatedAt)} />
            </div>

            <div className="mt-6">
              <MissionActions missionId={mission.id} state={mission.state} />
            </div>
          </div>
        </Panel>

        {/* ── Content grid ── */}
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            {/* Selection rationale */}
            <Panel>
              <SectionHeader eyebrow="issue selection" title="Selection rationale" />
              <div className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6">
                <Metric label="Why selected" value={mission.selection.rationale} />
                <Metric label="Why now" value={mission.selection.whyNow} />
                <Metric label="Risk note" value={mission.selection.riskNote} />
              </div>
            </Panel>

            {/* Acceptance criteria */}
            <Panel>
              <SectionHeader eyebrow="mission scope" title="Acceptance criteria" />
              <div className="space-y-2 p-5 sm:p-6">
                {mission.acceptanceCriteria.map((item) => (
                  <div key={item} className="flex gap-3">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                    <p className="text-sm leading-7 text-white/65">{item}</p>
                  </div>
                ))}
                {mission.nonGoals.length > 0 && (
                  <>
                    <p className="mt-4 font-mono text-[0.68rem] uppercase tracking-[0.28em] text-slate-500">Non-goals</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {mission.nonGoals.map((item) => (
                        <Pill key={item} tone="gray">{item}</Pill>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </Panel>

            {/* Event log */}
            <Panel>
              <SectionHeader eyebrow="mission log" title="Recent events" right={<span className="font-mono text-xs text-slate-500">{events.length} events</span>} />
              <div className="space-y-px">
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
            {/* Approval & branch */}
            <Panel>
              <SectionHeader eyebrow="approval gate" title="Approval & branch" />
              <div className="grid gap-3 p-5 sm:p-6">
                <Metric label="Approval status" value={mission.approval.status.replaceAll("_", " ")} />
                <Metric label="Channel" value={mission.approval.channel} />
                <Metric label="Requested" value={fmt(mission.approval.requestedAt)} />
                <Metric label="Resolved" value={fmt(mission.approval.resolvedAt)} />
                <Metric label="Branch" value={mission.branch.name ?? "Not created"} />
                <Metric label="PR URL" value={mission.branch.pullRequestUrl ?? "Not opened"} />
              </div>
            </Panel>

            {/* Checks */}
            <Panel>
              <SectionHeader eyebrow="evaluation" title="Checks summary" right={<span className="font-mono text-xs text-slate-500">{mission.checks.filter((c) => c.status === "passed").length}/{mission.checks.length} passed</span>} />
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
      </div>
    </main>
  );
}
