import Link from "next/link";

import { listMissionEvents, listMissions } from "@/src/lib/nightshift/store";
import type { CheckResult, Mission, MissionEvent } from "@/src/lib/nightshift/types";
import { MissionActions, AutoRefresh } from "./components/MissionActions";

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

  if (value === "approved" || value === "passed" || value === "queued") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (value === "pending" || value === "awaiting_approval" || value === "running") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-700";
}

function DetailRow({
  label,
  value,
  tone = "light",
}: {
  label: string;
  value: string;
  tone?: "light" | "dark";
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-200/70 py-3 last:border-b-0">
      <dt className={`text-sm ${tone === "dark" ? "text-slate-400" : "text-slate-500"}`}>{label}</dt>
      <dd className={`max-w-[65%] text-right text-sm font-medium ${tone === "dark" ? "text-slate-100" : "text-slate-900"}`}>
        {value}
      </dd>
    </div>
  );
}

function CheckCard({ check }: { check: CheckResult }) {
  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium text-slate-950">{check.label}</p>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${pillClasses(check.status)}`}>
          {check.status.replaceAll("_", " ")}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{check.summary}</p>
      <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
        <p>Started: {formatTimestamp(check.startedAt)}</p>
        <p>Completed: {formatTimestamp(check.completedAt)}</p>
      </div>
    </li>
  );
}

function EventItem({ event }: { event: MissionEvent }) {
  return (
    <li className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm">
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
  );
}

function MissionHero({ mission }: { mission: Mission }) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.08)]">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">
          Mission Control
        </span>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${pillClasses(mission.state)}`}>
          {mission.state.replaceAll("_", " ")}
        </span>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${pillClasses(mission.riskLevel)}`}>
          {mission.riskLevel} risk
        </span>
      </div>

      <div className="mt-6 space-y-4">
        <p className="text-sm uppercase tracking-[0.16em] text-slate-500">
          #{mission.issue.number} · {mission.issue.owner}/{mission.issue.repo}
        </p>
        <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.04em] text-slate-950 md:text-6xl">
          {mission.issue.title}
        </h1>
        <p className="max-w-3xl text-lg leading-8 text-slate-600">{mission.summary}</p>
      </div>

      <dl className="mt-8 grid gap-4 rounded-[1.5rem] border border-slate-200 bg-slate-50 px-5 py-4 md:grid-cols-2 xl:grid-cols-4">
        <DetailRow label="Mission ID" value={mission.id} />
        <DetailRow label="Approval" value={mission.approval.status.replaceAll("_", " ")} />
        <DetailRow label="Latest action" value={mission.latestAction} />
        <DetailRow label="Updated" value={formatTimestamp(mission.updatedAt)} />
      </dl>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link
          href={`/missions/${mission.id}`}
          className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Open mission detail
        </Link>
        <a
          href={mission.issue.url ?? "#"}
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-indigo-200 hover:text-indigo-600"
        >
          View source issue
        </a>
      </div>
    </section>
  );
}

export default async function Home() {
  const missions = await listMissions();
  const mission = missions[0] ?? null;
  const events = mission ? (await listMissionEvents(mission.id)).slice(0, 6) : [];

  if (!mission) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-24 text-slate-50">
        <div className="max-w-xl rounded-[2rem] border border-white/10 bg-white/5 p-10 text-center shadow-2xl">
          <p className="text-sm uppercase tracking-[0.18em] text-slate-400">Night Shift</p>
          <h1 className="mt-4 text-4xl font-semibold">No active mission.</h1>
          <p className="mt-4 text-base leading-7 text-slate-300">
            Select an issue from the configured repository to start a new mission.
          </p>
          <div className="mt-6">
            <MissionActions missionId={null} state={null} />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.18),_transparent_30%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_42%,_#e2e8f0_100%)] px-6 py-10 text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <AutoRefresh interval={3000} />
        <MissionHero mission={mission} />
        <MissionActions missionId={mission.id} state={mission.state} />

        <section className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-8">
            <div className="rounded-[2rem] border border-slate-200 bg-white/85 p-7 shadow-[0_20px_80px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">Selection rationale</h2>
                <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                  deterministic local store
                </span>
              </div>
              <div className="mt-6 grid gap-5 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-500">Why selected</p>
                  <p className="mt-2 text-sm leading-6 text-slate-800">{mission.selection.rationale}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-500">Why now</p>
                  <p className="mt-2 text-sm leading-6 text-slate-800">{mission.selection.whyNow}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-500">Risk note</p>
                  <p className="mt-2 text-sm leading-6 text-slate-800">{mission.selection.riskNote}</p>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white/85 p-7 shadow-[0_20px_80px_rgba(15,23,42,0.08)]">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">Acceptance criteria</h2>
              <ul className="mt-5 space-y-3">
                {mission.acceptanceCriteria.map((item) => (
                  <li key={item} className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm leading-6 text-emerald-950">
                    {item}
                  </li>
                ))}
              </ul>

              <h3 className="mt-8 text-lg font-semibold text-slate-900">Non-goals</h3>
              <ul className="mt-4 flex flex-wrap gap-3">
                {mission.nonGoals.map((item) => (
                  <li key={item} className="rounded-full border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700">
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white/85 p-7 shadow-[0_20px_80px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">Recent mission events</h2>
                <p className="text-sm text-slate-500">{events.length} stored events</p>
              </div>
              <ul className="mt-5 space-y-4">
                {events.map((event) => (
                  <EventItem key={event.id} event={event} />
                ))}
              </ul>
            </div>
          </div>

          <aside className="space-y-8">
            <div className="rounded-[2rem] border border-slate-200 bg-slate-950 p-7 text-slate-100 shadow-[0_20px_80px_rgba(15,23,42,0.18)]">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Approval & branch</p>
              <dl className="mt-5 space-y-4">
                <DetailRow label="Approval status" value={mission.approval.status.replaceAll("_", " ")} tone="dark" />
                <DetailRow label="Approval channel" value={mission.approval.channel} tone="dark" />
                <DetailRow label="Requested" value={formatTimestamp(mission.approval.requestedAt)} tone="dark" />
                <DetailRow label="Resolved" value={formatTimestamp(mission.approval.resolvedAt)} tone="dark" />
                <DetailRow label="Retry count" value={String(mission.retryCount)} tone="dark" />
                <DetailRow label="Branch" value={mission.branch.name ?? "Not created"} tone="dark" />
                <DetailRow label="PR URL" value={mission.branch.pullRequestUrl ?? "Not opened"} tone="dark" />
              </dl>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white/85 p-7 shadow-[0_20px_80px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">Checks summary</h2>
                <p className="text-sm text-slate-500">{mission.checks.length} checks</p>
              </div>
              <ul className="mt-5 space-y-4">
                {mission.checks.map((check) => (
                  <CheckCard key={check.id} check={check} />
                ))}
              </ul>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
