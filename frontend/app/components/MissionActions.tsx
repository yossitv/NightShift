"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function MissionActions({
  missionId,
  state,
}: {
  missionId: string | null;
  state: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const terminal = ["pr_opened", "failed", "canceled", "declined"];

  async function action(url: string, method = "POST") {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, { method });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Request failed");
      }
      router.refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  function buttonClasses(tone: "primary" | "approve" | "decline" | "launch" | "ghost" | "cancel") {
    if (tone === "approve") {
      return "border-[#14532d] bg-[#14532d]/80 text-[#dcfce7] hover:bg-[#166534]";
    }

    if (tone === "decline") {
      return "border-[#7f1d1d] bg-[#7f1d1d]/85 text-[#ffe4e6] hover:bg-[#991b1b]";
    }

    if (tone === "launch") {
      return "border-[#0f766e] bg-[#0f766e]/80 text-[#ccfbf1] hover:bg-[#115e59]";
    }

    if (tone === "ghost") {
      return "border-white/10 bg-white/[0.03] text-slate-100 hover:border-[#634bff]/35 hover:text-white";
    }

    if (tone === "cancel") {
      return "border-white/10 bg-transparent text-slate-300 hover:border-[#7f1d1d]/35 hover:text-[#fecdd3]";
    }

    return "border-[#634bff]/40 bg-[#634bff]/85 text-white hover:bg-[#745fff]";
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {(!missionId || terminal.includes(state ?? "")) && (
        <button
          onClick={() => action("/api/missions/select")}
          disabled={loading}
          className={`rounded-2xl border px-5 py-3 text-sm font-semibold shadow-[0_18px_35px_rgba(99,75,255,0.22)] transition disabled:cursor-not-allowed disabled:opacity-50 ${buttonClasses("primary")}`}
        >
          {loading ? "Selecting..." : "Select Another Issue"}
        </button>
      )}

      {state === "candidate_selected" && missionId && (
        <>
          <button
            onClick={() => {
              action(`/api/missions/${missionId}/cancel`).then(() => {
                action("/api/missions/select");
              });
            }}
            disabled={loading}
            className={`rounded-2xl border px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${buttonClasses("ghost")}`}
          >
            Skip
          </button>
          <button
            onClick={() => action(`/api/missions/${missionId}/approve`)}
            disabled={loading}
            className={`rounded-2xl border px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${buttonClasses("approve")}`}
          >
            Start Anyway
          </button>
        </>
      )}

      {state === "awaiting_approval" && missionId && (
        <>
          <button
            onClick={() => action(`/api/missions/${missionId}/approve`)}
            disabled={loading}
            className={`rounded-2xl border px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${buttonClasses("approve")}`}
          >
            Approve
          </button>
          <button
            onClick={() => action(`/api/missions/${missionId}/decline`)}
            disabled={loading}
            className={`rounded-2xl border px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${buttonClasses("decline")}`}
          >
            Decline
          </button>
        </>
      )}

      {state === "queued" && missionId && (
        <button
          onClick={() => action(`/api/missions/${missionId}/start`)}
          disabled={loading}
          className={`rounded-2xl border px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${buttonClasses("launch")}`}
        >
          {loading ? "Starting..." : "Start Mission"}
        </button>
      )}

      {missionId && state && !terminal.includes(state) && state !== "candidate_selected" && (
        <button
          onClick={() => action(`/api/missions/${missionId}/cancel`)}
          disabled={loading}
          className={`rounded-2xl border px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${buttonClasses("cancel")}`}
        >
          Cancel
        </button>
      )}

      {error && (
        <span className="rounded-2xl border border-[#7f1d1d] bg-[#7f1d1d]/35 px-3 py-2 font-label-ui text-[11px] uppercase tracking-[0.16em] text-[#fecdd3]">
          {error}
        </span>
      )}
    </div>
  );
}

export function IssueSelectButton({ issueNumber, disabled: externalDisabled }: { issueNumber: number; disabled?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function select() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/missions/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueNumber }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed");
      }
      router.refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={select}
        disabled={loading || externalDisabled}
        className="shrink-0 rounded-full border border-[#634bff]/40 bg-[#634bff]/10 px-4 py-2 font-mono text-[0.68rem] uppercase tracking-[0.2em] text-[#a594ff] transition hover:bg-[#634bff]/20 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {loading ? "..." : externalDisabled ? "Busy" : "Select"}
      </button>
      {error && (
        <span className="rounded-full border border-red-300/30 bg-red-300/5 px-3 py-1 font-mono text-[0.6rem] text-red-200">
          {error}
        </span>
      )}
    </div>
  );
}

export function AutoRefresh({ interval = 3000 }: { interval?: number }) {
  const router = useRouter();

  useEffect(() => {
    const handle = window.setInterval(() => router.refresh(), interval);
    return () => window.clearInterval(handle);
  }, [interval, router]);

  return null;
}

/**
 * LiveIssueList — polls /api/issues and /api/issues/pending so new issues
 * and their voice call decisions appear in real time.
 */
type Issue = {
  number: number;
  title: string;
  labels: { name: string }[];
  created_at: string;
};

type PendingEntry = {
  issue: { number: number };
  riskLevel: string;
  decision: "pending" | "approved" | "declined" | "deferred";
  callId: string | null;
};

type MissionEntry = {
  id: string;
  state: string;
  issue: { number: number };
  riskLevel: string;
  approval: { status: string; channel: string };
};

function DecisionBadge({ decision }: { decision: string }) {
  if (decision === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-300/35 bg-orange-300/10 px-2.5 py-1 font-mono text-[0.68rem] uppercase tracking-[0.2em] text-orange-100">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-400" />
        </span>
        Calling
      </span>
    );
  }
  if (decision === "approved") {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-300/35 bg-emerald-300/10 px-2.5 py-1 font-mono text-[0.68rem] uppercase tracking-[0.2em] text-emerald-100">
        Approved
      </span>
    );
  }
  if (decision === "declined") {
    return (
      <span className="inline-flex items-center rounded-full border border-red-300/35 bg-red-300/10 px-2.5 py-1 font-mono text-[0.68rem] uppercase tracking-[0.2em] text-red-100">
        Declined
      </span>
    );
  }
  if (decision === "deferred") {
    return (
      <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2.5 py-1 font-mono text-[0.68rem] uppercase tracking-[0.2em] text-slate-200">
        Deferred
      </span>
    );
  }
  return null;
}

function MissionBadge({ state }: { state: string }) {
  const toneMap: Record<string, string> = {
    candidate_selected: "border-[#634BFF]/35 bg-[#634BFF]/10 text-[#a594ff]",
    awaiting_approval: "border-orange-300/35 bg-orange-300/10 text-orange-100",
    queued: "border-[#634BFF]/35 bg-[#634BFF]/10 text-[#a594ff]",
    planning: "border-cyan-300/35 bg-cyan-300/10 text-cyan-100",
    coding: "border-cyan-300/35 bg-cyan-300/10 text-cyan-100",
    testing: "border-cyan-300/35 bg-cyan-300/10 text-cyan-100",
    pr_opened: "border-emerald-300/35 bg-emerald-300/10 text-emerald-100",
    failed: "border-red-300/35 bg-red-300/10 text-red-100",
    declined: "border-red-300/35 bg-red-300/10 text-red-100",
    canceled: "border-white/15 bg-white/5 text-slate-200",
  };
  const cls = toneMap[state] ?? "border-white/15 bg-white/5 text-slate-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[0.68rem] uppercase tracking-[0.2em] ${cls}`}>
      {state.replaceAll("_", " ")}
    </span>
  );
}

export function LiveIssueList({ interval = 5000 }: { interval?: number }) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [pending, setPending] = useState<PendingEntry[]>([]);
  const [missions, setMissions] = useState<MissionEntry[]>([]);
  const [prevCount, setPrevCount] = useState<number | null>(null);
  const [newIssueIds, setNewIssueIds] = useState<Set<number>>(new Set());
  const router = useRouter();

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const [issuesRes, pendingRes, missionsRes] = await Promise.all([
          fetch("/api/issues"),
          fetch("/api/issues/pending"),
          fetch("/api/missions"),
        ]);
        const issuesData = await issuesRes.json();
        const pendingData = await pendingRes.json();
        const missionsData = await missionsRes.json();
        if (!active) return;

        const fetched = (issuesData.issues ?? []).filter(
          (i: Record<string, unknown>) => !i.pull_request
        ) as Issue[];

        setPending(pendingData.pending ?? []);
        setMissions(missionsData.missions ?? []);

        // Detect newly appeared issues
        if (prevCount !== null && fetched.length > prevCount) {
          const oldNumbers = new Set(issues.map((i) => i.number));
          const fresh = fetched.filter((i) => !oldNumbers.has(i.number));
          if (fresh.length > 0) {
            setNewIssueIds(new Set(fresh.map((i) => i.number)));
            setTimeout(() => {
              if (active) setNewIssueIds(new Set());
            }, 5000);
            router.refresh();
          }
        }

        setPrevCount(fetched.length);
        setIssues(fetched);
      } catch {
        // ignore
      }
    }

    poll();
    const handle = window.setInterval(poll, interval);
    return () => {
      active = false;
      window.clearInterval(handle);
    };
  }, [interval, router, prevCount, issues]);

  if (issues.length === 0) return null;

  // Build lookup maps
  const pendingMap = new Map(pending.map((p) => [p.issue.number, p]));
  const missionMap = new Map(missions.map((m) => [m.issue.number, m]));

  return (
    <div className="rounded-[1.75rem] border border-white/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] shadow-[0_0_0_1px_rgba(0,212,255,0.05)]">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6">
        <div className="space-y-1">
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.32em] text-cyan-200/70">Live</p>
          <h2 className="text-lg font-semibold text-white">Open Issues</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <span className="font-mono text-xs text-slate-500">{issues.length} issues</span>
        </div>
      </div>
      <div className="space-y-px">
        {issues.map((issue) => {
          const isNew = newIssueIds.has(issue.number);
          const pendingEntry = pendingMap.get(issue.number);
          const missionEntry = missionMap.get(issue.number);

          return (
            <div
              key={issue.number}
              className={`flex items-center justify-between gap-4 border-b border-white/6 px-5 py-4 last:border-b-0 sm:px-6 transition-colors duration-700 cursor-pointer hover:bg-white/[0.03] ${
                isNew ? "bg-cyan-400/10" : pendingEntry?.decision === "declined" ? "bg-red-400/5" : ""
              }`}
              onClick={() => router.push(`/issues/${issue.number}`)}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-slate-500">#{issue.number}</span>
                  <span className="text-sm font-medium text-white">{issue.title}</span>
                  {isNew && (
                    <span className="inline-flex items-center rounded-full border border-cyan-300/35 bg-cyan-300/10 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-cyan-100 animate-pulse">
                      New
                    </span>
                  )}
                  {pendingEntry && <DecisionBadge decision={pendingEntry.decision} />}
                  {!pendingEntry && missionEntry?.approval?.status === "approved" && <DecisionBadge decision="approved" />}
                  {!pendingEntry && missionEntry?.approval?.status === "declined" && <DecisionBadge decision="declined" />}
                  {!pendingEntry && missionEntry?.state === "awaiting_approval" && !missionEntry?.approval?.status?.includes("approved") && <DecisionBadge decision="pending" />}
                  {missionEntry && <MissionBadge state={missionEntry.state} />}
                </div>
                {issue.labels?.length > 0 && (
                  <div className="mt-1 flex gap-1">
                    {issue.labels.map((l) => (
                      <span
                        key={l.name}
                        className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2.5 py-1 font-mono text-[0.68rem] uppercase tracking-[0.2em] text-slate-200"
                      >
                        {l.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <IssueSelectButton issueNumber={issue.number} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
