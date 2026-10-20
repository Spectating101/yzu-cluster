import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { approveJob, fetchJson } from "./api.js";
import { jobReviewFacts } from "./jobReviewFacts.js";
import "./job-review.css";

export function JobReviewDialog({ jobId, canApprove, onClose, onApproved }) {
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    if (!jobId) return undefined;
    const previous = document.activeElement;
    dialogRef.current?.focus();
    const keydown = (event) => {
      if (event.key === "Escape" && !busyRef.current) closeRef.current?.();
      if (event.key !== "Tab") return;
      const controls = [...(dialogRef.current?.querySelectorAll("button:not(:disabled), [href], input, [tabindex=\"0\"]") || [])];
      if (!controls.length) { event.preventDefault(); return; }
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus?.(); };
  }, [jobId]);
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    setJob(null);
    setError("");
    fetchJson(`/library/jobs/${encodeURIComponent(jobId)}`)
      .then((value) => { if (!cancelled) setJob(value); })
      .catch((err) => { if (!cancelled) setError(err.message || "Could not load the request."); });
    return () => { cancelled = true; };
  }, [jobId]);
  if (!jobId) return null;
  const plan = job?.plan || {};
  const request = plan.api_plan?.request || {};
  const approve = async () => {
    setBusy(true);
    setError("");
    try {
      await approveJob(jobId);
      onApproved?.(jobId);
      onClose?.();
    } catch (err) {
      setError(err.message || "Approval failed.");
    } finally {
      setBusy(false);
    }
  };
  return createPortal(
    <div className="rd-v2-library-package-scrim">
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Review collection request" className="rd-v2-library-package-panel">
        <header className="rd-v2-library-package-head">
          <h2>Review collection request</h2>
          <button type="button" onClick={onClose} disabled={busy} className="rd-v2-btn">Close</button>
        </header>
        {!job && !error ? <p role="status">Loading the saved collection plan…</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        {job ? <>
          <h3>{job.title || jobId}</h3>
          <dl className="rd-v2-job-review-facts">
            <div><dt>Status</dt><dd>{job.status === "pending_approval" ? "Awaiting approval" : String(job.status || "Unknown").replaceAll("_", " ")}</dd></div>
            <div><dt>Source</dt><dd>{plan.provider || plan.source_id || plan.connector_id || "Not recorded"}</dd></div>
            <div><dt>Destination</dt><dd>{plan.destination || (plan.dataset_id ? `Library · ${plan.dataset_id}` : "Default collection destination")}</dd></div>
            {jobReviewFacts(request).map(({ label, value }) =>
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
          <p>Approval runs this saved plan and adds its result to Library after validation and archiving.</p>
          {canApprove && job.status === "pending_approval" ?
            <button type="button" onClick={approve} disabled={busy} className="rd-v2-btn primary">{busy ? "Approving…" : "Approve collection"}</button> : null}
        </> : null}
      </section>
    </div>, document.body,
  );
}
