import { useEffect, useMemo, useRef, useState } from "react";
import {
  applySynthesisThreadPatch,
  approveJob,
  createSynthesisThread,
  getSynthesisProfile,
  getSynthesisThread,
  getSynthesisThreadDiscoverHandoff,
  listSynthesisProfiles,
  listSynthesisThreads,
  runSynthesis,
  submitSynthesisThreadExecution,
} from "@/v2/api";
import { loadChatSessionId } from "@/v2/deskSession";
import { SynthesisGraphCanvas } from "@/v2/SynthesisGraphCanvas";
import {
  ATTENTION_SYNTHESIS_PROJECT,
  applyProjectProposal,
  constructionStateFromProject,
  discoverQueryFromHandoff,
  emptyConstructionProject,
  findAttentionSynthesisThread,
  isUnformedSynthesisProject,
  loadCustomSynthesisProjectKeys,
  loadStoredSynthesisThreadId,
  newSynthesisProjectKey,
  projectFromSynthesisProfile,
  projectFromSynthesisThread,
  rejectProjectProposal,
  rememberCustomSynthesisProjectKey,
  storeSynthesisThreadId,
  synthesisGroundingPrompt,
  synthesisNodeObject,
  synthesisProjectObject,
  synthesisProjectStats,
} from "@/v2/synthesisWorkspace";
import { PageShell } from "@/v2/ui";

const VIEW_TABS = [
  ["map", "Map"],
  ["plan", "Research plan"],
  ["evidence", "Evidence"],
];

function profileRows(payload) {
  if (Array.isArray(payload)) return payload;
  return payload?.profiles || payload?.items || payload?.results || [];
}

function readableMaterialisation(value) {
  return String(value || "not_materialised").replaceAll("_", " ");
}

const ACTIVE_EXECUTION_STATUSES = new Set([
  "pending_approval",
  "approved",
  "queued",
  "running",
  "produced",
  "archiving",
  "registering",
  "completed",
]);

function executionLabel(status) {
  const labels = {
    ready: "Ready for review",
    pending_approval: "Approval required",
    approved: "Approved",
    queued: "Queued",
    running: "Constructing asset",
    produced: "Output produced",
    archiving: "Verifying archive",
    registering: "Registering in Library",
    completed: "Completing registration",
    registered: "Registered",
    failed: "Execution failed",
    cancelled: "Cancelled",
  };
  return labels[status] || readableMaterialisation(status || "ready");
}

function metricLabel(metric = {}) {
  const fn = String(metric.function || "aggregate").toLowerCase();
  const source = metric.column ? ` ${metric.column}` : " rows";
  const alias = metric.as ? ` → ${metric.as}` : "";
  return `${fn}${source}${alias}`;
}

function ProjectTabs({ projects, activeId, onChange, onNew }) {
  return (
    <div className="rd-syn-project-tabs" role="tablist" aria-label="Open synthesis work">
      <div className="rd-syn-project-tab-scroll">
        {projects.slice(0, 5).map((project) => (
          <button
            key={project.id}
            type="button"
            role="tab"
            aria-selected={project.id === activeId}
            className={project.id === activeId ? "is-active" : ""}
            onClick={() => onChange(project.id)}
          >
            <span className="rd-syn-tab-mark" />
            <span>{project.title}</span>
            {project.id === activeId ? <b aria-hidden>×</b> : null}
          </button>
        ))}
      </div>
      <button type="button" className="rd-syn-new-project" onClick={onNew} aria-label="Start new synthesis">
        ＋
      </button>
    </div>
  );
}

function ProjectHeader({ project, stats, view, onView, onOpenSourcingContext, onRunProfile, profileRunBusy, durableError, unformed }) {
  const registered = project.execution?.status === "registered";
  return (
    <header className="rd-syn-project-head">
      <div className="rd-syn-project-copy">
        <div className="rd-syn-project-kicker">
          <span className={`rd-syn-maturity is-${project.maturity}`}>
            {registered ? "Registered output" : project.maturityLabel}
          </span>
          {unformed ? (
            <span>{registered ? "Method record pending" : "No evidence mapped"}</span>
          ) : (
            <>
              <span>{stats.held} held</span>
              {stats.queryable ? <span>{stats.queryable} queryable</span> : null}
              {stats.proposed ? <span>{stats.proposed} proposed</span> : null}
              {stats.missing ? <span>{stats.missing} ideal gap</span> : null}
            </>
          )}
        </div>
        <h2>{project.title}</h2>
        <p>{project.objective}</p>
        {onOpenSourcingContext ? (
          <button
            type="button"
            className="rd-syn-ask-project"
            data-testid="synthesis-discover-handoff"
            onClick={onOpenSourcingContext}
          >
            <span aria-hidden>↗</span>
            Open sourcing context
          </button>
        ) : null}
        {onRunProfile ? (
          <button type="button" className="rd-syn-run-profile" onClick={onRunProfile} disabled={profileRunBusy}>
            {profileRunBusy ? "Running registered profile…" : "Run registered profile"}
          </button>
        ) : null}
        {durableError ? (
          <p role="alert" className="rd-syn-visible-error" data-testid="synthesis-durable-error">
            {durableError}
          </p>
        ) : null}
      </div>
      {unformed ? (
        <div className="rd-syn-view-tabs" aria-label="Synthesis workspace stage">
          <span className="is-active" aria-current="page">{registered ? "Registered output" : "Working brief"}</span>
        </div>
      ) : (
        <nav className="rd-syn-view-tabs" aria-label="Synthesis workspace views">
          {VIEW_TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-current={view === id ? "page" : undefined}
              className={view === id ? "is-active" : ""}
              onClick={() => onView(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      )}
    </header>
  );
}

function ExecutionShelf({
  project,
  onSubmit,
  onApprove,
  onOpenRegisteredOutput,
  executionBusy,
  approvalBusy,
}) {
  const spec = project.execution_spec || {};
  const execution = project.execution || {};
  const status = String(execution.status || (spec.input_dataset_id ? "ready" : "")).toLowerCase();
  if (!status) return null;

  const registered = status === "registered";
  const failed = status === "failed" || status === "cancelled";
  const metrics = Array.isArray(spec.metrics) ? spec.metrics : [];
  const groupBy = Array.isArray(spec.group_by) ? spec.group_by : [];
  const manifestId = execution.manifest_id || execution.output_manifest_id || execution.manifest?.id || "";
  const specHash = execution.accepted_spec_hash || execution.spec_hash || project.accepted_spec_hash || "";
  const canSubmit = status === "ready" || failed;

  return (
    <section className={`rd-syn-execution-shelf is-${status}`} data-testid="synthesis-execution-shelf" aria-label="Synthesis execution plan">
      <header>
        <div>
          <span>{registered ? "Registered research asset" : "Bounded execution plan"}</span>
          <h3>{registered ? execution.output_dataset_id || spec.output_dataset_id || project.title : "Review, approve, and materialise"}</h3>
        </div>
        <strong className="rd-syn-execution-pill" data-testid="synthesis-execution-state">{executionLabel(status)}</strong>
      </header>

      <div className="rd-syn-execution-facts">
        <div><span>Input</span><strong className="mono">{spec.input_dataset_id || execution.input_dataset_id || "Not reported"}</strong></div>
        <div><span>Output</span><strong className="mono">{execution.output_dataset_id || spec.output_dataset_id || "Not resolved"}</strong></div>
        <div><span>Group by</span><strong>{groupBy.length ? groupBy.join(" · ") : "Whole dataset"}</strong></div>
        <div><span>Spec revision</span><strong className="mono">{specHash ? specHash.slice(0, 16) : "Accepted thread state"}</strong></div>
      </div>

      {metrics.length ? (
        <div className="rd-syn-execution-metrics" data-testid="synthesis-execution-metrics">
          <span>Aggregations</span>
          <div>{metrics.map((metric, index) => <code key={`${metric.as || metric.function}-${index}`}>{metricLabel(metric)}</code>)}</div>
        </div>
      ) : null}

      {registered ? (
        <div className="rd-syn-execution-proof" data-testid="synthesis-execution-proof">
          <div><span>Rows</span><strong>{execution.rows ?? "—"}</strong></div>
          <div><span>Manifest</span><strong className="mono">{manifestId || "Recorded"}</strong></div>
          <div><span>Drive archive</span><strong>{execution.drive_verified === true ? "Verified" : "Not reported"}</strong></div>
          <div><span>Library state</span><strong>Query ready</strong></div>
        </div>
      ) : null}

      {failed ? (
        <p className="rd-syn-execution-error" role="alert" data-testid="synthesis-execution-error">
          {execution.error || execution.message || "The bounded execution did not complete. Review the failure before retrying."}
        </p>
      ) : null}

      <footer>
        {status === "pending_approval" ? (
          <button type="button" className="primary" data-testid="synthesis-approve-execution" onClick={onApprove} disabled={approvalBusy}>
            {approvalBusy ? "Approving…" : "Approve execution"}
          </button>
        ) : null}
        {canSubmit ? (
          <button type="button" className="primary" data-testid="synthesis-submit-execution" onClick={onSubmit} disabled={executionBusy}>
            {executionBusy ? "Submitting…" : failed ? "Retry execution" : "Request execution"}
          </button>
        ) : null}
        {registered && onOpenRegisteredOutput ? (
          <button type="button" className="primary" data-testid="synthesis-open-registered-output" onClick={onOpenRegisteredOutput}>
            Open registered asset
          </button>
        ) : null}
        {ACTIVE_EXECUTION_STATUSES.has(status) && status !== "pending_approval" ? (
          <span className="rd-syn-execution-refresh">Refreshing durable execution state…</span>
        ) : null}
      </footer>
    </section>
  );
}

function NewObjectiveDialog({ open, value, onChange, onClose, onSubmit, busy, error }) {
  if (!open) return null;
  return (
    <div
      className="rd-syn-proposal-dialog rd-syn-objective-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Start synthesis"
      data-testid="synthesis-objective-dialog"
    >
      <button type="button" className="rd-syn-proposal-scrim" aria-label="Cancel new synthesis" onClick={onClose} />
      <section className="rd-syn-proposal-sheet">
        <div className="rd-syn-proposal-sheet-head">
          <span>New synthesis</span>
          <button type="button" aria-label="Close" onClick={onClose} disabled={busy}>×</button>
        </div>
        <h3>What research construct do you need?</h3>
        <p>
          Describe the measure, panel, proxy, or derived asset. Synthesis starts as a research conversation —
          not a prefilled graph.
        </p>
        <label className="rd-syn-objective-field">
          <span>Research objective</span>
          <textarea
            data-testid="synthesis-objective-input"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            rows={4}
            autoFocus
            disabled={busy}
            placeholder="e.g. A weekly cross-exchange stablecoin liquidity stress indicator…"
          />
        </label>
        {error ? (
          <p role="alert" data-testid="synthesis-objective-error">{error}</p>
        ) : null}
        <footer>
          <button type="button" className="quiet" disabled={busy} onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="primary"
            data-testid="synthesis-objective-submit"
            disabled={busy || !String(value || "").trim()}
            onClick={onSubmit}
          >
            {busy ? "Creating…" : "Start research"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function WorkingBrief({ project, onAsk, onOpenRegisteredOutput }) {
  const registered = project.execution?.status === "registered";
  const manifestId = project.execution?.manifest_id || project.execution?.output_manifest_id || "";
  return (
    <section className="rd-syn-working-brief" data-testid="synthesis-working-brief" aria-label={registered ? "Registered output" : "Working brief"}>
      <article className="rd-syn-spec-document">
        <span className="rd-syn-doc-kicker">{registered ? "Registered output" : "Working brief"}</span>
        <h3>{project.title}</h3>
        <p className="rd-syn-doc-purpose">{project.objective}</p>
        <div className="rd-syn-brief-facts">
          <div><span>{registered ? "Output rows" : "Evidence"}</span><strong>{registered ? `${project.execution?.rows ?? "—"} registered` : "None mapped yet"}</strong></div>
          <div><span>Materialisation</span><strong>{registered ? "Registered in Library" : "Not materialised"}</strong></div>
          <div><span>{registered ? "Provenance" : "Construction"}</span><strong>{registered ? manifestId || "Manifest recorded" : "Not started"}</strong></div>
        </div>
        <p>
          {registered
            ? "The approved bounded execution is registered and reusable. The methodological evidence map remains an explicit follow-up, not a condition hidden behind the asset state."
            : "This thread begins as a research conversation. Ask the agent to search held and indexed evidence before any construction state is proposed. No borrowed evidence or materialised output is claimed."}
        </p>
        {registered && onOpenRegisteredOutput ? (
          <button type="button" className="rd-syn-open-output" onClick={onOpenRegisteredOutput}>Open registered asset</button>
        ) : (
          <button type="button" className="rd-syn-ask-project" data-testid="synthesis-brief-ask" onClick={onAsk}>
            <span aria-hidden>✦</span>
            Continue in Ask
          </button>
        )}
      </article>
    </section>
  );
}

function ProposalReview({ proposal, open, onOpen, onClose, onApply, onReject, busy }) {
  if (!proposal) return null;
  return (
    <>
      <button type="button" className="rd-syn-proposal-prompt" onClick={onOpen} data-testid="synthesis-proposal">
        <span aria-hidden>✦</span>
        <span><small>Agent proposal</small><strong>{proposal.title}</strong></span>
        <b>{open ? "Reviewing" : "Review"} →</b>
      </button>
      {open ? (
        <div className="rd-syn-proposal-dialog" role="dialog" aria-modal="true" aria-label="Review agent proposal">
          <button type="button" className="rd-syn-proposal-scrim" aria-label="Close proposal" onClick={onClose} />
          <section className="rd-syn-proposal-sheet">
            <div className="rd-syn-proposal-sheet-head">
              <span>Agent proposal</span>
              <button type="button" aria-label="Close proposal" onClick={onClose}>×</button>
            </div>
            <h3>{proposal.title}</h3>
            <p>{proposal.summary}</p>
            <div className="rd-syn-proposal-reason"><strong>Reasoning</strong><span>{proposal.reason}</span></div>
            <div className="rd-syn-proposal-impact">
              <strong>What changes</strong>
              <ul>{(proposal.impact || []).map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
            <footer>
              <button
                type="button"
                className="quiet"
                disabled={busy}
                onClick={() => { onReject(); }}
              >
                Reject
              </button>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => { onApply(); }}
              >
                Approve proposal
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}

function MapView({
  project,
  selectedNodeId,
  onSelectNode,
  proposalOpen,
  onOpenProposal,
  onCloseProposal,
  onApplyProposal,
  onRejectProposal,
  proposalBusy,
}) {
  return (
    <section className="rd-syn-map-view" aria-label="Construction map">
      <SynthesisGraphCanvas
        project={project}
        selectedNodeId={selectedNodeId}
        onSelectNode={onSelectNode}
      />
      <ProposalReview
        proposal={project.proposal}
        open={proposalOpen}
        onOpen={onOpenProposal}
        onClose={onCloseProposal}
        onApply={onApplyProposal}
        onReject={onRejectProposal}
        busy={proposalBusy}
      />
    </section>
  );
}

function SpecView({ project, profileRunResult = null, registeredOutput = null }) {
  const spec = project.spec || {};
  return (
    <section className="rd-syn-spec-view" data-testid="synthesis-spec-view">
      <article className="rd-syn-spec-document">
        <span className="rd-syn-doc-kicker">Research asset specification</span>
        <h3>{project.title}</h3>
        <p className="rd-syn-doc-purpose">{spec.purpose || project.objective}</p>
        <div className="rd-syn-doc-fact">
          <span>Target grain</span>
          <strong>{spec.grain || "Not resolved"}</strong>
        </div>
        <section>
          <h4>Core evidence</h4>
          <div className="rd-syn-doc-evidence">
            {(spec.coreEvidence || []).map(([name, role]) => (
              <div key={name}><span>✓</span><strong>{name}</strong><small>{role}</small></div>
            ))}
          </div>
        </section>
        {profileRunResult ? (
          <section className="rd-syn-profile-run-report" data-testid="synthesis-profile-run-report">
            <h4>Latest registered run</h4>
            <p>{profileRunResult.title || project.title}</p>
            <small>
              {profileRunResult.generated_at || "Run timestamp not reported"} · {Object.keys(profileRunResult.artifacts || {}).length} reported artifacts
            </small>
            <em>
              {registeredOutput
                ? `Registered asset available: ${registeredOutput.dataset_id}.`
                : "Execution output was returned by the registered profile. Registry promotion is not claimed here."}
            </em>
          </section>
        ) : null}
        {(spec.validation || []).length ? (
          <section>
            <h4>Validation</h4>
            <div className="rd-syn-doc-evidence validation">
              {spec.validation.map(([name, role]) => (
                <div key={name}><span>◇</span><strong>{name}</strong><small>{role}</small></div>
              ))}
            </div>
          </section>
        ) : null}
        {(spec.unavailable || []).length ? (
          <section>
            <h4>Ideal evidence unavailable</h4>
            <div className="rd-syn-doc-evidence unavailable">
              {spec.unavailable.map(([name, role]) => (
                <div key={name}><span>×</span><strong>{name}</strong><small>{role}</small></div>
              ))}
            </div>
          </section>
        ) : null}
        <section>
          <h4>Construction</h4>
          <ol className="rd-syn-doc-steps">
            {(spec.construction || []).map((step) => <li key={step}>{step}</li>)}
          </ol>
        </section>
        <section>
          <h4>Known limitations</h4>
          <ul className="rd-syn-doc-limitations">
            {(spec.limitations || []).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      </article>
      <aside className="rd-syn-spec-margin">
        <span>State</span>
        <strong>{project.maturityLabel}</strong>
        <small>{readableMaterialisation(project.materialisation)}</small>
        <hr />
        <span>Why this exists</span>
        <p>The specification persists what the agent and researcher have agreed before data is materialised.</p>
      </aside>
    </section>
  );
}

function DataView({ project }) {
  const sourceNodes = project.nodes.filter((node) => node.type === "source");
  return (
    <section className="rd-syn-data-view" data-testid="synthesis-data-view">
      <div className="rd-syn-data-toolbar">
        <div>
          <strong>Working data shape</strong>
          <span>Specification preview · no rows materialised</span>
        </div>
        <button type="button" disabled>Preview rows</button>
      </div>
      <div className="rd-syn-data-grid">
        <section>
          <header><span>Evidence inventory</span><small>{sourceNodes.length} mapped sources</small></header>
          <div className="rd-syn-data-table sources">
            <div className="head"><span>Source</span><span>State</span><span>Grain</span><span>Role</span></div>
            {sourceNodes.map((node) => (
              <div key={node.id}>
                <span><strong>{node.label}</strong><small>{node.source || "—"}</small></span>
                <span className={`state is-${node.status}`}>{node.status.replaceAll("_", " ")}</span>
                <span className="mono">{node.grain || "—"}</span>
                <span>{node.role || "—"}</span>
              </div>
            ))}
          </div>
        </section>
        <section>
          <header><span>Planned output schema</span><small>{project.plannedColumns?.length || 0} fields</small></header>
          {project.plannedColumns?.length ? (
            <div className="rd-syn-data-table schema">
              <div className="head"><span>Field</span><span>Meaning</span><span>Role</span></div>
              {project.plannedColumns.map(([name, meaning, role]) => (
                <div key={name}>
                  <span className="mono">{name}</span>
                  <span>{meaning}</span>
                  <span className={`schema-role is-${role}`}>{role}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rd-syn-data-empty">This registered profile does not expose a planned schema yet.</div>
          )}
        </section>
      </div>
    </section>
  );
}

function parseCoverage(value) {
  const years = String(value || "").match(/(?:19|20)\d{2}/g) || [];
  if (!years.length) return null;
  return { start: Number(years[0]), end: Number(years.at(-1)) || 2026 };
}

function ChartsView({ project, onAsk }) {
  const sources = project.nodes
    .filter((node) => node.type === "source")
    .map((node) => ({ ...node, span: parseCoverage(node.coverage) }))
    .filter((node) => node.span);
  const minYear = Math.min(...sources.map((node) => node.span.start), 2021);
  const maxYear = Math.max(...sources.map((node) => node.span.end), 2026);
  const range = Math.max(1, maxYear - minYear);

  return (
    <section className="rd-syn-charts-view" data-testid="synthesis-charts-view">
      <article className="rd-syn-coverage-chart">
        <header>
          <div><span>Evidence coverage</span><strong>{minYear} → {maxYear}</strong></div>
          <small>Registry metadata · not row counts</small>
        </header>
        <div className="rd-syn-coverage-years">
          {[minYear, Math.round(minYear + range / 3), Math.round(minYear + (2 * range) / 3), maxYear].map((year) => <span key={year}>{year}</span>)}
        </div>
        <div className="rd-syn-coverage-bars">
          {sources.map((node) => {
            const left = ((node.span.start - minYear) / range) * 100;
            const width = Math.max(4, ((node.span.end - node.span.start) / range) * 100);
            return (
              <div key={node.id}>
                <span>{node.label}</span>
                <div><i className={`is-${node.status}`} style={{ left: `${left}%`, width: `${Math.min(100 - left, width)}%` }} /></div>
              </div>
            );
          })}
        </div>
      </article>
      <div className="rd-syn-chart-ideas">
        {(project.chartIdeas || []).map(([title, description]) => (
          <button key={title} type="button" onClick={() => onAsk?.(title)}>
            <span>✦</span>
            <strong>{title}</strong>
            <p>{description}</p>
            <small>Ask agent to preview →</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function EvidenceView({ project, onAsk }) {
  return (
    <section className="rd-syn-evidence-view" data-testid="synthesis-evidence-view">
      <DataView project={project} />
      <ChartsView project={project} onAsk={onAsk} />
    </section>
  );
}

async function ensureAttentionThread() {
  const storedId = loadStoredSynthesisThreadId(ATTENTION_SYNTHESIS_PROJECT.id);
  if (storedId) {
    try {
      const thread = await getSynthesisThread(storedId);
      if (thread?.id) return thread;
    } catch {
      /* fall through to list/create */
    }
  }

  const listed = await listSynthesisThreads({
    limit: 30,
    sessionId: loadChatSessionId() || "",
  });
  const existing = findAttentionSynthesisThread(listed, ATTENTION_SYNTHESIS_PROJECT);
  if (existing?.id) {
    storeSynthesisThreadId(existing.id, ATTENTION_SYNTHESIS_PROJECT.id);
    return existing;
  }

  const created = await createSynthesisThread({
    objective: ATTENTION_SYNTHESIS_PROJECT.objective,
    title: ATTENTION_SYNTHESIS_PROJECT.title,
    sessionId: loadChatSessionId() || "",
    requiredGrain: ATTENTION_SYNTHESIS_PROJECT.spec?.grain || "asset × week",
    state: constructionStateFromProject(ATTENTION_SYNTHESIS_PROJECT),
  });
  if (created?.id) storeSynthesisThreadId(created.id, ATTENTION_SYNTHESIS_PROJECT.id);
  return created;
}

export function SynthesisPage({
  datasets = [],
  onAskComposer,
  onSelectObject,
  onOpenDiscover,
  onOpenLibrary,
  proposalRefreshEpoch = 0,
}) {
  const [registryProjects, setRegistryProjects] = useState([]);
  const [attentionProject, setAttentionProject] = useState(ATTENTION_SYNTHESIS_PROJECT);
  const [customProjects, setCustomProjects] = useState([]);
  const [projectOverrides, setProjectOverrides] = useState({});
  const [activeId, setActiveId] = useState(ATTENTION_SYNTHESIS_PROJECT.id);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [view, setView] = useState("map");
  const [proposalOpen, setProposalOpen] = useState(false);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [durableError, setDurableError] = useState("");
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [durableReady, setDurableReady] = useState(false);
  const [objectiveOpen, setObjectiveOpen] = useState(false);
  const [objectiveDraft, setObjectiveDraft] = useState("");
  const [objectiveBusy, setObjectiveBusy] = useState(false);
  const [objectiveError, setObjectiveError] = useState("");
  const [profileRunBusy, setProfileRunBusy] = useState(false);
  const [profileRunResult, setProfileRunResult] = useState(null);
  const [executionBusy, setExecutionBusy] = useState(false);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const pendingGroundingRef = useRef(null);

  useEffect(() => {
    let active = true;
    listSynthesisProfiles()
      .then(async (payload) => {
        const rows = profileRows(payload).slice(0, 4);
        const details = await Promise.all(rows.map(async (row) => {
          const id = row?.profile_id || row?.id || row?.key || row?.name;
          if (!id) return row;
          if (row?.inputs || row?.sources || row?.datasets || row?.peer_sources) return row;
          try {
            const detail = await getSynthesisProfile(id);
            return detail?.profile || detail || row;
          } catch {
            return row;
          }
        }));
        if (!active) return;
        setRegistryProjects(details.map((row) => projectFromSynthesisProfile(row, datasets)).filter(Boolean));
      })
      .catch(() => {
        if (active) setRegistryProjects([]);
      });
    return () => {
      active = false;
    };
  }, [datasets]);

  useEffect(() => {
    let active = true;
    setDurableReady(false);
    ensureAttentionThread()
      .then((thread) => {
        if (!active || !thread?.id) return;
        setAttentionProject(projectFromSynthesisThread(thread, ATTENTION_SYNTHESIS_PROJECT));
        setProjectOverrides((current) => {
          const next = { ...current };
          delete next[ATTENTION_SYNTHESIS_PROJECT.id];
          return next;
        });
        setDurableError("");
      })
      .catch(() => {
        if (!active) return;
        setAttentionProject(ATTENTION_SYNTHESIS_PROJECT);
      })
      .finally(() => {
        if (active) setDurableReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const keys = loadCustomSynthesisProjectKeys();
    if (!keys.length) {
      setCustomProjects([]);
      return undefined;
    }
    Promise.all(
      keys.map(async (projectKey) => {
        const threadId = loadStoredSynthesisThreadId(projectKey);
        if (!threadId) return null;
        try {
          const thread = await getSynthesisThread(threadId);
          if (!thread?.id) return null;
          const stateKey = thread.state?.projectKey;
          if (stateKey !== projectKey) return null;
          return projectFromSynthesisThread(
            thread,
            emptyConstructionProject({
              projectKey,
              objective: thread.objective || "",
              title: thread.title || "",
            }),
          );
        } catch {
          return null;
        }
      }),
    ).then((rows) => {
      if (!active) return;
      setCustomProjects(rows.filter(Boolean));
    });
    return () => {
      active = false;
    };
  }, []);

  const baseProjects = useMemo(
    () => [
      attentionProject,
      ...customProjects.filter((project) => project.id !== ATTENTION_SYNTHESIS_PROJECT.id),
      ...registryProjects.filter(
        (project) =>
          project.id !== ATTENTION_SYNTHESIS_PROJECT.id &&
          !customProjects.some((custom) => custom.id === project.id),
      ),
    ],
    [attentionProject, customProjects, registryProjects],
  );
  const projects = useMemo(
    () => baseProjects.map((project) => projectOverrides[project.id] || project),
    [baseProjects, projectOverrides],
  );
  const project = projects.find((item) => item.id === activeId) || projects[0];
  const stats = synthesisProjectStats(project);
  const unformed = isUnformedSynthesisProject(project);
  const showSourcingHandoff =
    Boolean(project?.threadId) &&
    project.id === ATTENTION_SYNTHESIS_PROJECT.id &&
    stats.missing > 0;
  const registeredOutputId = project?.outputDatasetId || project?.execution?.output_dataset_id || "";
  const registeredOutput = registeredOutputId
    ? datasets.find((dataset) => dataset.dataset_id === registeredOutputId) || { dataset_id: registeredOutputId }
    : null;

  useEffect(() => {
    const status = String(project?.execution?.status || "").toLowerCase();
    if (!project?.threadId || !ACTIVE_EXECUTION_STATUSES.has(status)) return undefined;

    let active = true;
    let timer = null;
    const refresh = async () => {
      try {
        const thread = await getSynthesisThread(project.threadId);
        if (!active || !thread?.id) return;
        const fallback = project.id === ATTENTION_SYNTHESIS_PROJECT.id
          ? ATTENTION_SYNTHESIS_PROJECT
          : emptyConstructionProject({
              projectKey: project.id,
              objective: project.objective,
              title: project.title,
            });
        const next = projectFromSynthesisThread(thread, fallback);
        replaceProjectState(next);
        const nextStatus = String(next.execution?.status || "").toLowerCase();
        if (ACTIVE_EXECUTION_STATUSES.has(nextStatus)) {
          timer = window.setTimeout(refresh, 2200);
        }
      } catch {
        if (active) timer = window.setTimeout(refresh, 3500);
      }
    };

    timer = window.setTimeout(refresh, 900);
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [project?.threadId, project?.id, project?.objective, project?.title, project?.execution?.status]);

  useEffect(() => {
    if (!proposalRefreshEpoch || !project?.threadId) return;
    let active = true;
    getSynthesisThread(project.threadId)
      .then((thread) => {
        if (!active || !thread?.id) return;
        const fallback = project.id === ATTENTION_SYNTHESIS_PROJECT.id
          ? ATTENTION_SYNTHESIS_PROJECT
          : emptyConstructionProject({
              projectKey: project.id,
              objective: project.objective,
              title: project.title,
            });
        const next = projectFromSynthesisThread(thread, fallback);
        if (project.id === ATTENTION_SYNTHESIS_PROJECT.id) {
          setAttentionProject(next);
        } else {
          setCustomProjects((current) => current.map((item) => (item.id === project.id ? next : item)));
        }
        setProposalOpen(Boolean(next.proposal));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [proposalRefreshEpoch, project?.threadId, project?.id, project?.objective, project?.title]);

  useEffect(() => {
    if (!project) return;
    const node = selectedNodeId ? project.nodes.find((item) => item.id === selectedNodeId) : null;
    onSelectObject?.(node ? synthesisNodeObject(project, node) : synthesisProjectObject(project));
    if (pendingGroundingRef.current) {
      const prompt = pendingGroundingRef.current;
      pendingGroundingRef.current = null;
      onAskComposer?.(prompt);
    }
  }, [project, selectedNodeId, onSelectObject, onAskComposer]);

  const selectProject = (id) => {
    setActiveId(id);
    setSelectedNodeId("");
    setView("map");
    setProposalOpen(false);
  };

  const selectNode = (node) => setSelectedNodeId(node?.id || "");
  const askChart = (chartTitle) => onAskComposer?.({
    prompt: `For the synthesis "${project.title}", propose a ${chartTitle} preview using only evidence currently held or honestly queryable. Explain which actual fields and source states are required; do not invent values.`,
    displayText: `Preview ${chartTitle}`,
  });
  const openObjectiveDialog = () => {
    setObjectiveError("");
    setObjectiveDraft("");
    setObjectiveOpen(true);
  };
  const closeObjectiveDialog = () => {
    if (objectiveBusy) return;
    setObjectiveOpen(false);
    setObjectiveError("");
  };
  const askAboutActive = () => {
    if (!project) return;
    onAskComposer?.(synthesisGroundingPrompt(project));
  };

  const runRegisteredProfile = async () => {
    if (!project?.profileId || profileRunBusy) return;
    setProfileRunBusy(true);
    setDurableError("");
    try {
      const result = await runSynthesis(project.profileId, { previewLimit: 12, gapLimit: 40 });
      setProfileRunResult(result || null);
    } catch (err) {
      setDurableError(err?.message || "Could not run the registered synthesis profile.");
    } finally {
      setProfileRunBusy(false);
    }
  };

  const approveExecution = async () => {
    const jobId = project?.execution?.job_id;
    if (!jobId || approvalBusy) return;
    setApprovalBusy(true);
    setDurableError("");
    try {
      const result = await approveJob(jobId);
      const job = result?.job || result || {};
      replaceProjectState({
        ...project,
        execution: {
          ...(project.execution || {}),
          status: job.status || "queued",
          job_id: job.id || jobId,
        },
      });
    } catch (err) {
      setDurableError(err?.message || "Could not approve this Synthesis execution.");
    } finally {
      setApprovalBusy(false);
    }
  };

  const submitExecution = async () => {
    if (!project?.threadId || !project?.execution_spec || executionBusy) return;
    setExecutionBusy(true);
    setDurableError("");
    try {
      const result = await submitSynthesisThreadExecution(project.threadId);
      if (!result?.job?.id) throw new Error(result?.error || "Execution submission did not return a job.");
      const next = {
        ...project,
        execution: {
          ...(project.execution || {}),
          ...(result.job || {}),
          status: result.job.status || "pending_approval",
          job_id: result.job.id,
          output_dataset_id: result.job.output_dataset_id || project.execution_spec.output_dataset_id,
          error: null,
        },
      };
      replaceProjectState(next);
    } catch (err) {
      setDurableError(err?.message || "Could not submit the approved synthesis spec.");
    } finally {
      setExecutionBusy(false);
    }
  };

  const createFromObjective = async () => {
    const objective = String(objectiveDraft || "").trim();
    if (!objective || objectiveBusy) return;
    setObjectiveBusy(true);
    setObjectiveError("");
    setDurableError("");
    const projectKey = newSynthesisProjectKey();
    const draft = emptyConstructionProject({ projectKey, objective });
    try {
      const created = await createSynthesisThread({
        objective: draft.objective,
        title: draft.title,
        state: constructionStateFromProject(draft),
      });
      if (!created?.id) throw new Error("Synthesis thread create did not return a stable id.");
      storeSynthesisThreadId(created.id, projectKey);
      rememberCustomSynthesisProjectKey(projectKey);
      const next = projectFromSynthesisThread(created, draft);
      setCustomProjects((current) => [next, ...current.filter((item) => item.id !== projectKey)]);
      setProjectOverrides((current) => {
        const copy = { ...current };
        delete copy[projectKey];
        return copy;
      });
      setActiveId(projectKey);
      setSelectedNodeId("");
      setView("map");
      setProposalOpen(false);
      setObjectiveOpen(false);
      setObjectiveDraft("");
      pendingGroundingRef.current = synthesisGroundingPrompt(next);
    } catch (err) {
      setObjectiveError(err?.message || "Could not create a durable synthesis thread.");
    } finally {
      setObjectiveBusy(false);
    }
  };

  function replaceProjectState(next) {
    if (!next?.id) return;
    setProjectOverrides((current) => {
      if (!Object.prototype.hasOwnProperty.call(current, next.id)) return current;
      const copy = { ...current };
      delete copy[next.id];
      return copy;
    });
    if (next.id === ATTENTION_SYNTHESIS_PROJECT.id) {
      setAttentionProject(next);
      return;
    }
    setCustomProjects((current) => {
      const exists = current.some((item) => item.id === next.id);
      if (!exists) return [next, ...current];
      return current.map((item) => (item.id === next.id ? next : item));
    });
  }

  const applyLocalDecision = (decision) => {
    const next = decision === "accept" ? applyProjectProposal(project) : rejectProjectProposal(project);
    setProjectOverrides((current) => ({ ...current, [project.id]: next }));
    replaceProjectState({
      ...next,
      threadId: project.threadId,
      sessionId: project.sessionId,
      conversationId: project.conversationId,
    });
    setSelectedNodeId(decision === "accept" ? project.proposal?.nodeId || "" : "");
    setProposalOpen(false);
  };

  const applyProposal = async () => {
    if (!project?.proposal || proposalBusy) return;
    if (!project.threadId) {
      applyLocalDecision("accept");
      return;
    }
    setProposalBusy(true);
    setDurableError("");
    try {
      const thread = await applySynthesisThreadPatch(project.threadId, {
        decision: "accept",
        proposalId: project.proposal.id,
        proposalHash: project.proposal.proposal_hash,
      });
      const next = projectFromSynthesisThread(thread, project);
      replaceProjectState(next);
      setSelectedNodeId(project.proposal?.nodeId || "");
      setProposalOpen(false);
    } catch (err) {
      setDurableError(err?.message || "Could not persist proposal acceptance.");
    } finally {
      setProposalBusy(false);
    }
  };

  const rejectProposal = async () => {
    if (!project?.proposal || proposalBusy) return;
    if (!project.threadId) {
      applyLocalDecision("reject");
      return;
    }
    setProposalBusy(true);
    setDurableError("");
    try {
      const thread = await applySynthesisThreadPatch(project.threadId, {
        decision: "reject",
        proposalId: project.proposal.id,
        proposalHash: project.proposal.proposal_hash,
      });
      const next = projectFromSynthesisThread(thread, project);
      replaceProjectState(next);
      setSelectedNodeId("");
      setProposalOpen(false);
    } catch (err) {
      setDurableError(err?.message || "Could not persist proposal rejection.");
    } finally {
      setProposalBusy(false);
    }
  };

  const openSourcingContext = async () => {
    if (!project?.threadId || handoffBusy) return;
    setHandoffBusy(true);
    setDurableError("");
    try {
      const handoff = await getSynthesisThreadDiscoverHandoff(project.threadId);
      if (handoff?.collection || handoff?.fake_collection) {
        throw new Error("Discover handoff returned an unexpected collection payload.");
      }
      const query = discoverQueryFromHandoff(handoff);
      if (!query) {
        throw new Error("Discover handoff did not include a usable sourcing query.");
      }
      onOpenDiscover?.(query, handoff);
    } catch (err) {
      setDurableError(err?.message || "Could not open Discover sourcing context.");
    } finally {
      setHandoffBusy(false);
    }
  };

  if (!project) return null;

  return (
    <PageShell
      className="rd-v2-synthesis-page"
      title="Synthesis"
      lead="Construct research assets from the lab and the reachable data universe."
    >
      <div className="rd-syn-workbench" data-testid="synthesis-workbench">
        <ProjectTabs projects={projects} activeId={project.id} onChange={selectProject} onNew={openObjectiveDialog} />
        <ProjectHeader
          project={project}
          stats={stats}
          view={view}
          onView={setView}
          onOpenSourcingContext={showSourcingHandoff ? openSourcingContext : undefined}
          onRunProfile={project.profileId ? runRegisteredProfile : undefined}
          profileRunBusy={profileRunBusy}
          durableError={durableError}
          unformed={unformed}
        />
        <ExecutionShelf
          project={project}
          onSubmit={submitExecution}
          onApprove={approveExecution}
          onOpenRegisteredOutput={registeredOutputId ? () => onOpenLibrary?.(registeredOutputId) : undefined}
          executionBusy={executionBusy}
          approvalBusy={approvalBusy}
        />
        <main className="rd-syn-editor-surface">
          {unformed ? (
            <WorkingBrief
              project={project}
              onAsk={askAboutActive}
              onOpenRegisteredOutput={registeredOutputId ? () => onOpenLibrary?.(registeredOutputId) : undefined}
            />
          ) : view === "map" ? (
            <MapView
              project={project}
              selectedNodeId={selectedNodeId}
              onSelectNode={selectNode}
              proposalOpen={proposalOpen}
              onOpenProposal={() => setProposalOpen(true)}
              onCloseProposal={() => setProposalOpen(false)}
              onApplyProposal={applyProposal}
              onRejectProposal={rejectProposal}
              proposalBusy={proposalBusy || (project.id === ATTENTION_SYNTHESIS_PROJECT.id && !durableReady)}
            />
          ) : view === "plan" ? (
            <SpecView
              project={project}
              profileRunResult={project.profileId ? profileRunResult : null}
              registeredOutput={registeredOutput}
            />
          ) : (
            <EvidenceView project={project} onAsk={askChart} />
          )}
        </main>
        <NewObjectiveDialog
          open={objectiveOpen}
          value={objectiveDraft}
          onChange={setObjectiveDraft}
          onClose={closeObjectiveDialog}
          onSubmit={createFromObjective}
          busy={objectiveBusy}
          error={objectiveError}
        />
      </div>
    </PageShell>
  );
}
