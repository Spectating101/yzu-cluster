import {
  RailEntityHeader,
  RailField,
  RailFieldGrid,
  RailFrame,
  RailStickyFooter,
} from "@/v2/RailFrame";
import {
  countOpsAttention,
  resourcesOpsPill,
  resourcesOpsPosture,
} from "@/v2/attentionModel";
import { formatCollectorState, workersToolbarFieldsFromRollup } from "@/v2/workersToolbarStat";

export function ResourcesOverviewRailPanel({ rollup, decisionCount, onViewActivity }) {
  const workers = rollup?.hero?.workers || {};
  const vault = rollup?.hero?.vault || {};
  const query = rollup?.hero?.query_engine || {};
  const reportedJobs = rollup?.motion?.jobs || rollup?.hero?.jobs || {};
  // The rollup carries lifetime/coarse health counts. Once the faculty-visible
  // job ledger has loaded, use the same deduplicated decision count as the
  // header, Settings, and Discover History so four surfaces cannot disagree.
  const decisionsLoading = decisionCount === null;
  const jobs = Number.isFinite(decisionCount)
    ? { ...reportedJobs, pending_approval: decisionCount }
    : decisionsLoading
      ? { ...reportedJobs, pending_approval: 0 }
    : reportedJobs;
  const counts = countOpsAttention({
    issues: rollup?.issues || [],
    jobs,
  });
  const sourceCount = rollup?.connect?.source_count;
  // VC-4: identical field set, vocabulary, and denominator as the toolbar/card.
  const collectorState = formatCollectorState(workersToolbarFieldsFromRollup(rollup));
  const vaultState = vault.used_tb != null
    ? `${vault.used_tb}/${vault.cap_tb ?? "?"} TB`
    : vault.cap_tb != null
      ? `${vault.cap_tb} TB capacity`
      : "Usage pending";
  const posture = decisionsLoading && !counts.opsTotal && !counts.running
    ? "Checking research decisions"
    : resourcesOpsPosture(counts);
  const pill = decisionsLoading && query.up !== false
    ? { label: "Syncing", warn: false }
    : resourcesOpsPill(counts, query.up);

  return (
    <RailFrame>
      <RailEntityHeader
        id="resources"
        title="Library capacity"
        description="Access, current usage, and research capability across the Library."
        pills={
          <span className={`rd-v2-pill${pill.warn ? " warn" : ""}`}>
            {pill.label}
          </span>
        }
      />
      <div className="rd-v2-rail-scroll">
        <section className={`rd-v2-resource-posture${pill.warn ? " warn" : ""}`}>
          <span>Now</span>
          <strong>{posture}</strong>
          <p>
            {query.up === false
              ? "Catalog and query service is offline."
              : sourceCount != null
                ? `${sourceCount} source routes are configured; authority is reported per route.`
                : "Source routes and collection capacity are available for inspection."}
          </p>
        </section>
        <p className="rd-v2-rail-section-label">Current capacity</p>
        <RailFieldGrid>
          <RailField
            label="Ops issues"
            value={counts.opsTotal ? String(counts.opsTotal) : "Clear"}
          />
          <RailField
            label="Decisions"
            value={decisionsLoading ? "Checking…" : counts.decisions ? String(counts.decisions) : "None"}
          />
          <RailField label="Running" value={counts.running ? String(counts.running) : "None"} />
          <RailField label="Collectors" value={collectorState} />
          <RailField label="Vault" value={vaultState} />
          <RailField label="Source inventory" value={sourceCount != null ? `${sourceCount} configured` : "Configured routes"} />
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
