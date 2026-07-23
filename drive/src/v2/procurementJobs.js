/** Bind cluster jobs to Discover candidates and normalize procure state. */

import { browseTargetKey } from "./discoverActions.js";

export function normalizedTitle(value) {
  return String(value || "").trim().toLowerCase();
}

export function jobTitle(job) {
  return job?.plan?.title || job?.plan?.dataset_id || job?.type || job?.id || "Collection job";
}

export function jobMatchesCandidate(job, candidate) {
  if (!job || !candidate) return false;
  const boundId = candidate.bound_job_id || candidate.job_id;
  if (boundId && job.id === boundId) return true;
  const candKey = String(candidate.candidate_key || "").trim();
  const jobKey = String(
    job.candidate_key || job.request?.candidate_key || job.plan?.candidate_key || "",
  ).trim();
  if (candKey && jobKey && candKey === jobKey) return true;
  const jt = normalizedTitle(jobTitle(job));
  const ct = normalizedTitle(candidate.title || candidate.name || candidate.dataset_id);
  if (!jt || !ct) return false;
  return ct.includes(jt) || jt.includes(ct);
}

export function findJobForCandidate(candidate, jobs = []) {
  if (!candidate) return null;
  if (candidate.bound_job) return candidate.bound_job;
  const boundId = candidate.bound_job_id || candidate.job_id;
  if (boundId) {
    return jobs.find((j) => j.id === boundId) || candidate.bound_job || null;
  }
  if (candidate.kind === "job_pending") {
    return jobs.find((j) => jobMatchesCandidate(j, candidate)) || null;
  }
  return null;
}

export function jobToCandidateRow(job) {
  if (!job) return null;
  const title = jobTitle(job);
  const plan = job.plan || {};
  const request = job.request || {};
  const candidateKey =
    job.candidate_key || plan.candidate_key || request.candidate_key || "";
  const sourceId = job.source_id || plan.source_id || request.source_id || "";
  const connectorId =
    job.connector_id ||
    plan.connector_id ||
    plan.catalog_connector_id ||
    request.connector_id ||
    "";
  return {
    kind: "job_pending",
    title,
    name: title,
    dataset_id: job.registered_dataset_id || plan.dataset_id || `job:${job.id}`,
    bound_job_id: job.id,
    bound_job: job,
    source: plan.source || job.type || "cluster",
    description: `Pending approval · ${job.id}`,
    queued: true,
    candidate_key: candidateKey,
    source_id: sourceId,
    connector_id: connectorId,
    job_id: job.id,
  };
}

export function bindJobsToCandidates(rows, jobs = [], localBindings = {}) {
  return rows.map((row) => {
    const key = browseTargetKey(row) || row.dataset_id || row.doi || row.title || row.url || row.name;
    const localJobId = key ? localBindings[key] : "";
    const boundId = localJobId || row.bound_job_id;
    if (!boundId) return row;
    const boundJob = jobs.find((j) => j.id === boundId) || row.bound_job;
    if (!boundJob) return { ...row, bound_job_id: boundId };
    return { ...row, bound_job_id: boundJob.id, bound_job: boundJob, queued: true };
  });
}

export function pendingApprovalJobs(jobs = []) {
  return jobs.filter((j) => j.status === "pending_approval");
}

export function pendingApprovalCount(jobs = []) {
  return pendingApprovalJobs(jobs).length;
}

export function activeProcurementJobs(jobs = []) {
  return jobs.filter((j) => ["pending_approval", "queued", "running"].includes(String(j.status || "")));
}
