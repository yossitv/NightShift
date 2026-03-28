import Link from "next/link";
import { notFound } from "next/navigation";

import { AutoRefresh, MissionActions } from "../../components/MissionActions";
import { getMission, listMissionEvents } from "@/src/lib/nightshift/store";

export const dynamic = "force-dynamic";

function formatTimestamp(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function pillClasses(value: string) {
  if (value === "high" || value === "failed" || value === "declined") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (value === "approved" || value === "passed" || value === "queued" || value === "pr_opened") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (value === "pending" || value === "awaiting_approval" || value === "running" || value === "retrying") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-700";
}

function MetricCard({
  label,
  value,
  tone = "light",
}: {
  label: string;
  value: string;
  tone?: "light" | "dark";
}) {
  return (
    <div className={`rounded-2xl border p-4 ${tone === "dark" ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}>
      <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${tone === "dark" ? "text-slate-400" : "text-slate-500"}`}>{label}</p>
      <p className={`mt-3 text-sm font-medium leading-6 ${tone === "dark" ? "text-slate-50" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}

export default async function MissionPage({ params }: { params: Promise<{ missionId: string }> }) {
  const { missionId } = await params;
  const mission = await getMission(missionId);

  if (!mission) {
    notFound();
  }

  const events = (await listMissionEvents(mission.id)).slice(0, 8);
  const passedChecks = mission.checks.filter((check) => check.status === "passed").length;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.10),_transparent_24%),linear-gradient(180deg,_#020617_0%,_#0f172a_36%,_#e2e8f0_100%)] px-4 py-6 text-slate-900 sm:px-6 sm:py-8">
      <AutoRefresh interval={3000} />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <section className="rounded-[2rem] border border-white/10 bg-slate-950/90 p-6 text-slate-50 shadow-[0_20px_80px_rgba(2,6,23,0.45)] sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300">Night Shift mission</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">{mission.issue.title}</h1>
            </div>
            <Link
              href="/"
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-indigo-300 hover:text-white"
            >
              Back to board
            </Link>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${pillClasses(mission.riskLevel)}`}>
              {mission.riskLevel} risk
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${pillClasses(mission.state)}`}>
              {mission.state.replaceAll("_", " ")}
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${pillClasses(mission.approval.status)}`}>
              {mission.approval.status.replaceAll("_", " ")}
            </span>
          </div>

          <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">{mission.summary}</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Issue" value={`#${mission.issue.number}`} tone="dark" />
            <MetricCard label="Retry count" value={String(mission.retryCount)} tone="dark" />
            <MetricCard label="Branch" value={mission.branch.name ?? "Branch pending"} tone="dark" />
            <MetricCard label="PR URL" value={mission.branch.pullRequestUrl ?? "PR pending"} tone="dark" />
          </div>

          <div className="mt-6">
            <MissionActions missionId={mission.id} state={mission.state} />
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">Selection rationale</h2>
                <a
                  href={mission.issue.url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                >
                  View issue
                </a>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <MetricCard label="Why selected" value={mission.selection.rationale} />
                <MetricCard label="Why now" value={mission.selection.whyNow} />
                <MetricCard label="Risk note" value={mission.selection.riskNote} />
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.08)]">
              <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">Recent mission log</h2>
              <ol className="mt-5 space-y-3">
                {events.map((event) => (
                  <li key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${pillClasses(event.state)}`}>
                        {event.state.replaceAll("_", " ")}
                      </span>
                      <span className="text-xs uppercase tracking-[0.16em] text-slate-400">{event.type.replaceAll("_", " ")}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium text-slate-900">{event.message}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      {formatTimestamp(event.createdAt)} · {event.actor.replaceAll("_", " ")}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.08)]">
              <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">Approval + execution</h2>
              <div className="mt-5 grid gap-3">
                <MetricCard label="Approval status" value={mission.approval.status.replaceAll("_", " ")} />
                <MetricCard label="Approval channel" value={mission.approval.channel} />
                <MetricCard label="Requested" value={formatTimestamp(mission.approval.requestedAt)} />
                <MetricCard label="Resolved" value={formatTimestamp(mission.approval.resolvedAt)} />
                <MetricCard label="Current state" value={mission.state.replaceAll("_", " ")} />
                <MetricCard label="Latest action" value={mission.latestAction} />
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">Checks</h2>
                <p className="text-sm text-slate-500">
                  {passedChecks}/{mission.checks.length} passed
                </p>
              </div>
              <ul className="mt-5 space-y-3">
                {mission.checks.map((check) => (
                  <li key={check.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">{check.label}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{check.summary}</p>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${pillClasses(check.status)}`}>
                        {check.status.replaceAll("_", " ")}
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">
                      {formatTimestamp(check.startedAt)} → {formatTimestamp(check.completedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
