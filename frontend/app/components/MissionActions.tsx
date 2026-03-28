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

export function IssueSelectButton({ issueNumber }: { issueNumber: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function select() {
    setLoading(true);
    try {
      await fetch("/api/missions/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueNumber }),
      });
      router.refresh();
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={select}
      disabled={loading}
      className="shrink-0 rounded-full border border-[#634bff]/40 bg-[#634bff]/10 px-4 py-2 font-mono text-[0.68rem] uppercase tracking-[0.2em] text-[#a594ff] transition hover:bg-[#634bff]/20 disabled:opacity-50"
    >
      {loading ? "..." : "Select"}
    </button>
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
