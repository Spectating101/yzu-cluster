const RUNNING = new Set(["queued", "claimed", "running", "leased", "dispatched", "in_progress"]);

export function requestCounts(jobs) {
  const counts = { waiting: 0, running: 0, ready: 0, failed: 0 };
  for (const job of Array.isArray(jobs) ? jobs : []) {
    const status = String(job?.status || "").toLowerCase();
    if (status === "pending_approval") counts.waiting += 1;
    else if (RUNNING.has(status)) counts.running += 1;
    else if (status === "completed") counts.ready += 1;
    else if (status === "failed") counts.failed += 1;
  }
  return counts;
}
