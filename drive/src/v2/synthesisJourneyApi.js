import { fetchJson } from "./api.js";

/**
 * Persist one exact, reviewable Synthesis proposal.
 *
 * This is deliberately a browser-owned workflow transition rather than an Ask
 * side effect. The backend validates graph operations and execution_spec,
 * computes the proposal hash, and persists the revision without applying it.
 */
export function persistSynthesisProposal(threadId, proposal) {
  if (!threadId) return Promise.reject(new Error("thread_id is required"));
  if (!proposal || typeof proposal !== "object") {
    return Promise.reject(new Error("proposal is required"));
  }
  return fetchJson(`/library/synthesis/threads/${encodeURIComponent(threadId)}/proposal`, {
    method: "POST",
    body: JSON.stringify({ proposal }),
  });
}

/** Exact approval job state for the current synthesis execution revision. */
export function getSynthesisExecutionJob(jobId) {
  if (!jobId) return Promise.resolve(null);
  return fetchJson(`/library/jobs/${encodeURIComponent(jobId)}`);
}

/**
 * Researcher approval of the exact queued job. Agents are not allowed to use
 * this transition; the normal desk session authority still applies server-side.
 */
export function approveSynthesisExecutionJob(jobId) {
  if (!jobId) return Promise.reject(new Error("job_id is required"));
  return fetchJson(`/library/jobs/${encodeURIComponent(jobId)}/approve`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
