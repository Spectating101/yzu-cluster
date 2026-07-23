import {
  RailEntityHeader,
  RailField,
  RailFieldGrid,
  RailFrame,
  RailStickyFooter,
} from "@/v2/RailFrame";

function countJobs(jobs = {}) {
  const running = Number(jobs.running ?? 0);
  const pending = Number(jobs.pending_approval ?? jobs.pending ?? 0);
  const failed = Number(jobs.failed ?? 0);
  return { running, pending, failed };
}

function isActionableIssue(issue) {
  if (!issue || typeof issue !== "object") return false;
  if (issue.action_required === true || issue.warn === true || issue.ok === false) return true;
  const state = [
    issue.severity,
    issue.status,
    issue.state,
    issue.tone,
    issue.kind,
    issue.label,
    issue.detail,
    issue.message,
  ].filter(Boolean).join(" ");
  return /\b(?:critical|error|failed|failure|offline|blocked|expired|unreachable|saturated|quota exceeded|credential missing|access denied)\b/i.test(state);
}

function attentionSummary({ actionableIssues, jobs, observationCount }) {
  const parts = [];
  if (jobs.pending) parts.push(`${jobs.pending} approval${jobs.pending === 1 ? "" : "s"}`);
  if (jobs.failed) parts.push(`${jobs.failed} failed job${jobs.failed === 1 ? "" : "s"}`);
  if (actionableIssues) parts.push(`${actionableIssues} resource alert${actionableIssues === 1 ? "" : "s"}`);
  if (observationCount) parts.push(`${observationCount} capacity observation${observationCount === 1 ? "" : "s"} logged`);
  return parts.join(" · ");
}

function observationSummary(count) {
  return `${count} capacity observation${count === 1 ? "" : "s"} ${count === 1 ? "is" : "are"} available; none is explicitly classified as actionable.`;
}

export function ResourcesOverviewRailPanel({ rollup, onViewActivity }) {
  const workers = rollup?.hero?.workers || {};
  const vault = rollup?.hero?.vault || {};
  const query = rollup?.hero?.query_engine || {};
  const jobs = countJobs(rollup?.motion?.jobs || rollup?.hero?.jobs || {});
  const issues = Array.isArray(rollup?.issues) ? rollup.issues : [];
  const actionableIssues = issues.filter(isActionableIssue).length;
  const observationCount = Number(rollup?.issues_count ?? issues.length ?? 0);
  const attention = actionableIssues + jobs.pending + jobs.failed;
  const sourceCount = rollup?.connect?.source_count;
  const collectorCount = workers.online ?? workers.joined ?? workers.busy ?? workers.total;
  const collectorState = workers.total != null && collectorCount != null
    ? `${collectorCount}/${workers.total} ${workers.busy != null ? "busy" : "available"}`
    : collectorCount != null
      ? `${collectorCount} available`
      : "State pending";
  const vaultState = vault.used_tb != null
    ? `${vault.used_tb}/${vault.cap_tb ?? "?"} TB`
    : vault.cap_tb != null
      ? `${vault.cap_tb} TB capacity`
      : "Usage pending";
  const posture = query.up === false
    ? "Desk connection offline"
    : attention > 0
      ? attention === 1 ? "1 action needs review" : `${attention} actions need review`
      : jobs.running > 0
        ? `${jobs.running} collection${jobs.running === 1 ? "" : "s"} running`
        : "Desk ready";
  const postureDetail = query.up === false
    ? "Catalog and query service is offline."
    : attention > 0
      ? attentionSummary({ actionableIssues, jobs, observationCount })
      : observationCount > 0
        ? observationSummary(observationCount)
        : sourceCount != null
          ? `${sourceCount} source routes are reachable through the desk.`
          : "Source routes and collection capacity are available for inspection.";
  const tone = query.up === false ? "offline" : attention > 0 ? "attention" : "ready";

  return (
    <RailFrame>
      <RailEntityHeader
        id="resources"
        title="Lab capacity"
        description="Access, current usage, and research capability across the lab."
        pills={
          <span className={`rd-v2-pill${tone === "attention" || tone === "offline" ? " warn" : ""}`}>
            {tone === "offline" ? "Offline" : tone === "attention" ? "Review" : "Ready"}
          </span>
        }
      />
      <div className="rd-v2-rail-scroll">
        <section className={`rd-v2-resource-posture${tone === "attention" || tone === "offline" ? " warn" : ""}`}>
          <span>Now</span>
          <strong>{posture}</strong>
          <p>{postureDetail}</p>
        </section>
        <p className="rd-v2-rail-section-label">Current capacity</p>
        <RailFieldGrid>
          <RailField label="Actionable" value={attention ? String(attention) : "Clear"} />
          <RailField label="Observations" value={observationCount ? String(observationCount) : "None"} />
          <RailField label="Running" value={jobs.running ? String(jobs.running) : "None"} />
          <RailField label="Collectors" value={collectorState} />
          <RailField label="Vault" value={vaultState} />
          <RailField label="Source reach" value={sourceCount != null ? `${sourceCount} routes` : "Configured routes"} />
          <RailField label="Desk connection" value={query.up === false ? "Offline" : "Connected"} />
        </RailFieldGrid>
      </div>
      <RailStickyFooter>
        <button type="button" className="rd-v2-btn sm primary" onClick={() => onViewActivity?.(null)}>
          Open activity
        </button>
      </RailStickyFooter>
    </RailFrame>
  );
}
