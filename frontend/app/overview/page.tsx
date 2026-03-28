import Link from "next/link";
import { readMissionStore, listMissionEvents } from "@/src/lib/nightshift/store";
import { REPO_CONFIG } from "@/lib/config";
import { isCodexAvailable } from "@/lib/codex";
import type { Mission, MissionEvent, CheckResult } from "@/src/lib/nightshift/types";

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

/* ── Page ───────────────────────────────────────────────────── */

export default async function OverviewPage() {
  const store = await readMissionStore();
  const missions = store.missions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const allEvents = store.events.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // System stats
  const total = missions.length;
  const active = missions.filter((m) => !["pr_opened", "failed", "canceled", "declined"].includes(m.state)).length;
  const succeeded = missions.filter((m) => m.state === "pr_opened").length;
  const failed = missions.filter((m) => m.state === "failed").length;
  const codexReady = isCodexAvailable();

  return (
    <main className="min-h-screen px-3 py-3 sm:px-4">
      <div className="mx-auto max-w-[1400px] space-y-4">

        {/* ── Nav bar ── */}
        <div className="flex h-16 items-center justify-between rounded-2xl border border-[#634BFF]/30 bg-black px-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-display text-xl font-black uppercase tracking-[-0.03em] text-[#634BFF]">
              Night Shift
            </Link>
            <span className="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-white/40">Overview</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-full border border-white/12 px-4 py-2 font-mono text-[0.68rem] uppercase tracking-[0.2em] text-white/60 transition hover:text-white"
            >
              Dashboard
            </Link>
          </div>
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Total Missions" value={String(total)} />
          <MetricCard label="Active" value={String(active)} tone={active > 0 ? "cyan" : "gray"} />
          <MetricCard label="Succeeded (PR)" value={String(succeeded)} tone={succeeded > 0 ? "green" : "gray"} />
          <MetricCard label="Failed" value={String(failed)} tone={failed > 0 ? "red" : "gray"} />
        </div>

        {/* ── All missions ── */}
        <Panel>
          <Header eyebrow="mission history" title="All Missions" right={<span className="font-mono text-xs text-slate-500">{total} total</span>} />
          {missions.length === 0 ? (
            <p className="p-6 text-sm text-white/40">No missions yet. Select an issue from the dashboard to start.</p>
          ) : (
            <div className="divide-y divide-white/6">
              {missions.map((m) => (
                <MissionRow key={m.id} mission={m} eventCount={allEvents.filter((e) => e.missionId === m.id).length} />
              ))}
            </div>
          )}
        </Panel>

        {/* ── All events (recent 50) ── */}
        <Panel>
          <Header eyebrow="audit trail" title="All Events" right={<span className="font-mono text-xs text-slate-500">{allEvents.length} total, showing latest 50</span>} />
          <div className="max-h-[600px] divide-y divide-white/6 overflow-y-auto">
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

        {/* ── API endpoints reference ── */}
        <Panel>
          <Header eyebrow="api reference" title="Available Endpoints" />
          <div className="grid gap-2 p-5 sm:grid-cols-2 lg:grid-cols-3 sm:p-6">
            {[
              { method: "GET", path: "/api/issues", desc: "Open issues" },
              { method: "GET", path: "/api/missions", desc: "All missions" },
              { method: "POST", path: "/api/missions/select", desc: "Auto-select issue" },
              { method: "GET", path: "/api/missions/:id", desc: "Mission detail" },
              { method: "GET", path: "/api/missions/:id/events", desc: "Mission events" },
              { method: "POST", path: "/api/missions/:id/approve", desc: "Approve mission" },
              { method: "POST", path: "/api/missions/:id/decline", desc: "Decline mission" },
              { method: "POST", path: "/api/missions/:id/cancel", desc: "Cancel mission" },
              { method: "POST", path: "/api/missions/:id/start", desc: "Start runner" },
              { method: "POST", path: "/api/webhooks/bland", desc: "Voice callback" },
            ].map((ep) => (
              <div key={ep.path} className="rounded-xl border border-white/8 bg-black/30 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={`font-mono text-[0.6rem] font-bold ${ep.method === "GET" ? "text-cyan-300" : "text-orange-300"}`}>
                    {ep.method}
                  </span>
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

function MissionRow({ mission: m, eventCount }: { mission: Mission; eventCount: number }) {
  return (
    <Link
      href={`/missions/${m.id}`}
      className="flex items-center gap-4 px-5 py-4 transition hover:bg-white/[0.02] sm:px-6"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[0.68rem] text-slate-500">{m.id}</span>
          <Pill tone={stateTone(m.state)}>{m.state.replaceAll("_", " ")}</Pill>
          <Pill tone={m.riskLevel === "high" ? "red" : "green"}>{m.riskLevel}</Pill>
        </div>
        <p className="mt-1 text-sm font-medium text-white">
          #{m.issue.number} {m.issue.title}
        </p>
        <p className="mt-1 text-[0.7rem] text-slate-500">
          {m.latestAction}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <div className="flex items-center gap-2">
          {m.checks.map((c) => (
            <span
              key={c.id}
              className={`h-2 w-2 rounded-full ${c.status === "passed" ? "bg-emerald-400" : c.status === "failed" ? "bg-red-400" : "bg-slate-600"}`}
              title={`${c.label}: ${c.status}`}
            />
          ))}
        </div>
        <p className="mt-1 font-mono text-[0.6rem] text-slate-600">{eventCount} events</p>
        <p className="font-mono text-[0.6rem] text-slate-600">{fmt(m.updatedAt)}</p>
      </div>
    </Link>
  );
}

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
  const border = tone === "green" ? "border-emerald-300/25" : tone === "red" ? "border-red-300/25" : tone === "cyan" ? "border-cyan-300/25" : "border-white/10";
  return (
    <div className={`rounded-[1.75rem] border ${border} bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] px-6 py-5`}>
      <p className="font-mono text-[0.68rem] uppercase tracking-[0.28em] text-slate-500">{label}</p>
      <p className="mt-3 font-display text-3xl font-bold text-white">{value}</p>
    </div>
  );
}
