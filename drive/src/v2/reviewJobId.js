export function reviewJobId(item) {
  return item?.bound_job?.id || item?.meta?.job_id || item?.job_id ||
    (["pending_approval", "approved", "queued", "running", "completed", "failed", "cancelled", "rejected"].includes(item?.status) ? item.id : "") || "";
}
