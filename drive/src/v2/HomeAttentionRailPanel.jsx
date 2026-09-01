import {
  RailEntityHeader,
  RailField,
  RailFieldGrid,
  RailFrame,
  RailStickyFooter,
} from "@/v2/RailFrame";

function humanize(value, fallback = "—") {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return text
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function owningSurface(row) {
  const explicit = String(row.location || "").trim();
  if (explicit) return explicit.replace(/\s*\/\s*/g, " / ");
  if (row.discoverMode === "history") return "Discover / History";
  if (row.tab === "browse") return "Discover";
  return humanize(row.tab || "Home");
}

function nextMove(row) {
  if (row.action === "review") return "Review the durable History record";
  if (row.action === "continue") return `Continue in ${owningSurface(row)}`;
  return row.next || "Inspect the owning surface";
}

function isApprovalPending(row, job) {
  const state = `${row.pill || ""} ${job?.status || ""} ${job?.state || ""}`.toLowerCase();
  return /pending|approval|awaiting review/.test(state);
}

export function HomeAttentionRailPanel({ object, onAskAbout }) {
  const row = object?.row || {};
  const job = row.job || row.resourceRow?.job || null;
  const approvalPending = isApprovalPending(row, job);
  const stateSummary = String(
    row.stateSummary || row.detail || "This work is currently selected by Home for researcher attention.",
  ).trim();
  const surface = owningSurface(row);
  const status = row.pill || humanize(job?.status || job?.state || row.kind, "Active");
  const workType = humanize(job?.type || row.kind, "Research work");

  return (
    <RailFrame>
      <RailEntityHeader
        id={job?.id || row.id || object?.id || "home-attention"}
        title={row.title || object?.title || "Home attention"}
        description={stateSummary}
        pills={status ? <span className={`rd-v2-pill${row.warn ? " warn" : ""}`}>{status}</span> : null}
      />

      <section className={`rd-v2-home-rail-verdict${approvalPending ? " warn" : ""}`} aria-label="Resume state">
        <span>Resume state</span>
        <strong>
          {approvalPending
            ? "A researcher decision is blocking the next durable step."
            : "Home has selected this as the next grounded work item."}
        </strong>
        <p>
          {approvalPending
            ? "No collection, execution, or registration should be inferred before the approval record is reviewed."
            : stateSummary}
        </p>
      </section>

      <div className="rd-v2-rail-scroll rd-v2-home-attention-scroll">
        <section className="rd-v2-home-rail-record" aria-label="Decision record">
          <span className="rd-v2-home-rail-label">Exact record</span>
          <RailFieldGrid>
            <RailField label="State" value={status} />
            <RailField label="Work type" value={workType} />
            <RailField label="Owning surface" value={surface} />
            {job?.id ? <RailField label="Job" value={job.id} mono /> : null}
          </RailFieldGrid>
        </section>

        <section className="rd-v2-home-rail-path" aria-label="Research path">
          <span className="rd-v2-home-rail-label">Where this goes</span>
          <div className="rd-v2-home-rail-path-step current">
            <span>Home / Pick up</span>
            <strong>{row.title || object?.title || "Selected work"}</strong>
            <p>Home is prioritizing this object; it is not executing it here.</p>
          </div>
          <div className="rd-v2-home-rail-path-step next">
            <span>{surface}</span>
            <strong>{nextMove(row)}</strong>
            <p>The owning surface holds the durable decision and lifecycle record.</p>
          </div>
          {approvalPending ? (
            <div className="rd-v2-home-rail-path-step conditional">
              <span>After approval</span>
              <strong>Collection and verification may proceed</strong>
              <p>Library readiness is only shown after the resulting evidence is actually registered and verified.</p>
            </div>
          ) : null}
        </section>
      </div>

      <RailStickyFooter>
        <button type="button" className="rd-v2-btn sm" onClick={() => onAskAbout?.(object)}>
          Ask about this decision →
        </button>
      </RailStickyFooter>
    </RailFrame>
  );
}
