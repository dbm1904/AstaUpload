"use client";

import { useEffect, useRef, useState } from "react";

type Status = "pending" | "processing" | "completed" | "failed";

type JobData = {
  id: string;
  status: Status;
  attempts: number;
  worker_name: string | null;
  error_message: string | null;
  completed_at: string | null;
};

const LABELS: Record<Status, string> = {
  pending: "Queued — waiting for Windows runner",
  processing: "Exporting BI data…",
  completed: "Export complete",
  failed: "Export failed",
};

const POLL_INTERVAL_MS = 5_000;
const TERMINAL: Status[] = ["completed", "failed"];

export function JobStatusPoller({ uploadId }: { uploadId: string }) {
  const [job, setJob] = useState<JobData | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/jobs/${uploadId}`);
        if (!res.ok) {
          setFetchError(`Status check returned ${res.status}`);
          return;
        }
        const data: JobData = await res.json();
        if (!cancelled) {
          setJob(data);
          setFetchError(null);
          if (!TERMINAL.includes(data.status)) {
            timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setFetchError(err instanceof Error ? err.message : "Network error");
          timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [uploadId]);

  if (fetchError && !job) {
    return <span className="status-pill">Could not check status: {fetchError}</span>;
  }

  if (!job) {
    return <span className="status-pill">Checking status…</span>;
  }

  return (
    <div>
      <span className={`status-pill status-${job.status}`}>{LABELS[job.status]}</span>
      {job.status === "processing" && job.worker_name && (
        <p>Runner: <code>{job.worker_name}</code></p>
      )}
      {job.status === "completed" && (
        <p>BI data has been written to Supabase. Attempt {job.attempts}.</p>
      )}
      {job.status === "failed" && job.error_message && (
        <p className="error-message">
          Error: {job.error_message}
        </p>
      )}
      {!TERMINAL.includes(job.status) && (
        <p>Refreshing every {POLL_INTERVAL_MS / 1000} seconds…</p>
      )}
    </div>
  );
}
