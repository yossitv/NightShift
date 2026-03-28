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

  async function action(url: string, method = "POST") {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, { method });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Request failed");
      router.refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {(!missionId || ["pr_opened", "failed", "canceled", "declined"].includes(state ?? "")) && (
        <button
          onClick={() => action("/api/missions/select")}
          disabled={loading}
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {loading ? "Selecting..." : "Select New Issue"}
        </button>
      )}

      {state === "awaiting_approval" && missionId && (
        <>
          <button
            onClick={() => action(`/api/missions/${missionId}/approve`)}
            disabled={loading}
            className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            onClick={() => action(`/api/missions/${missionId}/decline`)}
            disabled={loading}
            className="rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-500 disabled:opacity-50"
          >
            Decline
          </button>
        </>
      )}

      {state === "queued" && missionId && (
        <button
          onClick={() => action(`/api/missions/${missionId}/start`)}
          disabled={loading}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? "Starting..." : "Start Mission"}
        </button>
      )}

      {missionId && state && !["pr_opened", "failed", "canceled", "declined"].includes(state) && (
        <button
          onClick={() => action(`/api/missions/${missionId}/cancel`)}
          disabled={loading}
          className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-rose-300 hover:text-rose-600 disabled:opacity-50"
        >
          Cancel
        </button>
      )}

      {error && (
        <span className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700">
          {error}
        </span>
      )}
    </div>
  );
}

export function AutoRefresh({ interval = 3000 }: { interval?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), interval);
    return () => window.clearInterval(id);
  }, [interval, router]);

  return null;
}
