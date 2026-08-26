import { DeskError } from "@/v2/DeskError";
import { synthesisAssist } from "@/v2/synthesisAssist.js";
import { synthesisJourneyStage } from "@/v2/synthesisLifecycle";
import "./synthesis-home.css";

function text(value, fallback = "") {
  return String(value || "").trim() || fallback;
}

function normalizeStatus(value) {
  return text(value).toLowerCase().replace(/[ -]+/g, "_");
}

function executionStatus(thread) {
  return normalizeStatus(thread?.state?.execution?.status);
}

function isFailed(thread) {
  return executionStatus(thread) === "failed";
}

function titleFor(thread) {
  return text(thread?.title || thread?.state?.title, "Untitled synthesis");
}

function objectiveFor(thread) {
  return text(thread?.objective || thread?.state?.objective, "No research objective recorded yet.");
}

function outputFor(thread) {
  return text(
    thread?.state?.execution?.output_dataset_id || thread?.state?.execution_spec?.output_dataset_id,
  );
}

function phaseFor(thread) {
  if (isFailed(thread)) return "failed";
  return synthesisJourneyStage(thread);
}

const DECISION_KINDS = new Set([
  "resolve_scope",
  "resolve_units",
  "resolve_join",
  "review_recommendation",
  "review_proposal",
  "run_preview",
  "recover_preview",
  "review_preview",
  "approve_execution",
  "recover_build",
]);

function needsResearcherDecision(thread) {
  return DECISION_KINDS.has(synthesisAssist(thread).decisionKind);
}

function phaseLabel(thread) {
  const assist = synthesisAssist(thread);
  const phase = phaseFor(thread);
  if (phase === "failed") return "Needs recovery";
  if (phase === "build") return text(thread?.state?.execution?.status, "Build in progress").replace(/_/g, " ");
  if (phase === "result") {
    return executionStatus(thread) === "query_ready" ? "Query-ready result" : "Registered result";
  }
  return assist.status || assist.label || "Durable construction";
}

function actionLabel(thread) {
  const assist = synthesisAssist(thread);
  switch (assist.decisionKind) {
    case "resolve_scope": return "Resolve scope";
    case "resolve_units": return "Resolve units";
    case "resolve_join": return "Resolve join";
    case "review_recommendation": return "Review recommendation";
    case "review_proposal": return "Review proposal";
    case "run_preview": return assist.status === "Preview stale" ? "Rerun Preview" : "Run Preview";
    case "recover_preview": return "Inspect Preview";
    case "review_preview": return "Review Preview";
    case "approve_execution": return "Review approval";
    case "recover_build": return "Inspect failure";
    case "await_registration": return "View registration";
    case "open_result": return "Open result";
    case "map_evidence": return "Continue evidence";
    case "design_method": return "Continue method";
    default: break;
  }
  const phase = phaseFor(thread);
  if (phase === "failed") return "Inspect failure";
  if (phase === "build") return "View build";
  if (phase === "result") return "Open result";
  return "Continue";
}

function updatedLabel(thread) {
  const raw = thread?.updated_at || thread?.created_at;
  if (!raw) return "Durable thread";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "Durable thread";
  return `Updated ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function sortNewest(rows) {
  return [...rows].sort((a, b) => {
    const left = new Date(a?.updated_at || a?.created_at || 0).getTime() || 0;
    const right = new Date(b?.updated_at || b?.created_at || 0).getTime() || 0;
    return right - left;
  });
}

function ThreadCard({ thread, onOpen, priority = false }) {
  const output = outputFor(thread);
  const projectKey = text(thread?.project_key || thread?.state?.project_key);
  return (
    <button
      type="button"
      className={`s04-home-thread${priority ? " is-priority" : ""}`}
      onClick={() => onOpen?.(thread.id)}
      data-testid="synthesis-home-thread"
    >
      <span className="s04-home-thread-state">
        <b>{phaseLabel(thread)}</b>
        <small>{updatedLabel(thread)}</small>
      </span>
      <strong>{titleFor(thread)}</strong>
      <p>{output || objectiveFor(thread)}</p>
      <span className="s04-home-thread-foot">
        <small>{projectKey ? `Project · ${projectKey}` : output ? "Library-bound output" : "Durable construction"}</small>
        <em>{actionLabel(thread)} →</em>
      </span>
    </button>
  );
}

function ThreadSection({ eyebrow, title, description, rows, onOpen, priority = false, empty = "" }) {
  return (
    <section className="s04-home-section">
      <header>
        <div>
          <small>{eyebrow}</small>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        <em>{rows.length}</em>
      </header>
      {rows.length ? (
        <div className="s04-home-thread-grid">
          {rows.map((thread) => (
            <ThreadCard key={thread.id} thread={thread} onOpen={onOpen} priority={priority} />
          ))}
        </div>
      ) : empty ? <p className="s04-home-empty-row">{empty}</p> : null}
    </section>
  );
}

export function SynthesisHome({
  threads = [],
  loading = false,
  profiles = [],
  profilesLoading = false,
  profilesError = "",
  reasoningAvailable = false,
  reasoningStatus = "Assistant runtime not verified",
  onOpenThread,
  onNew,
  onStartBlueprint,
  onOpenResources,
}) {
  const allThreads = Array.isArray(threads) ? threads : [];
  const methods = Array.isArray(profiles) ? profiles : [];
  const needsYou = sortNewest(allThreads.filter((thread) => needsResearcherDecision(thread)));
  const building = sortNewest(allThreads.filter((thread) => phaseFor(thread) === "build" && !isFailed(thread)));
  const results = sortNewest(allThreads.filter((thread) => phaseFor(thread) === "result"));
  const active = sortNewest(allThreads.filter((thread) => {
    if (needsResearcherDecision(thread)) return false;
    const phase = phaseFor(thread);
    return !["build", "result"].includes(phase);
  }));
  const continueThread = needsYou[0] || active[0] || building[0] || results[0] || null;

  const scrollToMethods = () => {
    document.getElementById("synthesis-home-methods")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="s04-home" data-testid="synthesis-home-state">
      <header className="s04-home-hero">
        <div>
          <small>Synthesis workspace</small>
          <h1>Construct research assets from questions, evidence, and reusable methods.</h1>
          <p>
            Start something new, return to a durable construction, or reuse a registered method. Each construction keeps its own evidence, decisions, execution proof, and result.
          </p>
        </div>
        <dl aria-label="Synthesis workspace status">
          <div><dt>Active</dt><dd>{active.length}</dd></div>
          <div className={needsYou.length ? "needs" : ""}><dt>Needs you</dt><dd>{needsYou.length}</dd></div>
          <div><dt>Building</dt><dd>{building.length}</dd></div>
          <div><dt>Results</dt><dd>{results.length}</dd></div>
        </dl>
      </header>

      <section className="s04-home-entry" aria-label="Start or continue Synthesis work">
        <button
          type="button"
          className="s04-home-entry-card primary"
          onClick={onNew}
          disabled={!reasoningAvailable}
          title={!reasoningAvailable ? reasoningStatus : undefined}
        >
          <small>New construction</small>
          <strong>Start from a research question</strong>
          <span>Describe the object you need. Evidence and method become explicit decisions after creation.</span>
          <em>{reasoningAvailable ? "Start →" : "Assistant unavailable"}</em>
        </button>
        <button
          type="button"
          className="s04-home-entry-card"
          onClick={scrollToMethods}
          disabled={!methods.length}
        >
          <small>Reusable method</small>
          <strong>Start from registered work</strong>
          <span>{methods.length ? `${methods.length} registered method${methods.length === 1 ? "" : "s"} can seed a new construction.` : "No registered method is reported yet."}</span>
          <em>{methods.length ? "Browse methods ↓" : "None available"}</em>
        </button>
        <button
          type="button"
          className="s04-home-entry-card"
          onClick={() => continueThread && onOpenThread?.(continueThread.id)}
          disabled={!continueThread}
        >
          <small>Durable work</small>
          <strong>{needsYou.length ? "Return to what needs you" : "Continue a construction"}</strong>
          <span>{continueThread ? titleFor(continueThread) : "No saved construction exists yet."}</span>
          <em>{continueThread ? `${actionLabel(continueThread)} →` : "Nothing saved"}</em>
        </button>
      </section>

      {!reasoningAvailable ? (
        <aside className="s04-home-runtime">
          <span><strong>Creation is paused.</strong> {reasoningStatus}. Existing durable work remains inspectable.</span>
          <button type="button" className="rd-v2-btn" onClick={() => onOpenResources?.()}>Check Resources</button>
        </aside>
      ) : null}

      {loading ? <p className="s04-home-loading">Loading durable constructions…</p> : null}

      {!loading && !allThreads.length ? (
        <section className="s04-home-first">
          <small>Empty workspace</small>
          <h2>No Synthesis construction has been recorded yet.</h2>
          <p>The first durable object can begin from a research question or a registered method. Nothing is executed merely by starting one.</p>
          <button type="button" className="rd-v2-btn primary" onClick={onNew} disabled={!reasoningAvailable}>Start the first construction</button>
        </section>
      ) : null}

      {needsYou.length ? (
        <ThreadSection
          eyebrow="Decision queue"
          title="Needs your decision"
          description="Consequential construction choices, proposal reviews, Preview checks, approvals, and recoveries surface here instead of hiding in active work."
          rows={needsYou}
          onOpen={onOpenThread}
          priority
        />
      ) : null}

      <ThreadSection
        eyebrow="Active constructions"
        title="Research objects in progress"
        description="Evidence mapping and method design remain independently resumable when no explicit researcher decision is blocking them."
        rows={active}
        onOpen={onOpenThread}
        empty={!loading && allThreads.length ? "No construction is currently in research or method design." : ""}
      />

      {building.length ? (
        <ThreadSection
          eyebrow="Execution"
          title="Building now"
          description="These jobs have crossed the execution boundary. Their thread remains the source of truth for progress and proof."
          rows={building}
          onOpen={onOpenThread}
        />
      ) : null}

      {results.length ? (
        <ThreadSection
          eyebrow="Registered outputs"
          title="Reusable research assets"
          description="Completed constructions remain attached to their method and execution history while the resulting asset returns to Library."
          rows={results}
          onOpen={onOpenThread}
        />
      ) : null}

      <section className="s04-home-section s04-home-methods" id="synthesis-home-methods">
        <header>
          <div>
            <small>Reusable methods</small>
            <h2>Registered starting points</h2>
            <p>Using a method creates a new durable construction; it does not silently reuse old assumptions or execute work.</p>
          </div>
          <em>{methods.length}</em>
        </header>
        {profilesLoading ? <p className="s04-home-empty-row">Loading registered methods…</p> : null}
        {profilesError ? <DeskError raw={profilesError} surface="registered Synthesis methods" /> : null}
        {!profilesLoading && !profilesError && methods.length ? (
          <div className="s04-home-method-grid" data-testid="synthesis-home-methods">
            {methods.map((profile) => (
              <button
                type="button"
                key={profile.id}
                onClick={() => onStartBlueprint?.(profile)}
                disabled={!reasoningAvailable}
                title={!reasoningAvailable ? reasoningStatus : text(profile.title, profile.id)}
              >
                <small>Registered method</small>
                <strong>{text(profile.title, profile.id)}</strong>
                <span>{text(profile.description, "Recorded construction recipe")}</span>
                <em>Use as starting point →</em>
              </button>
            ))}
          </div>
        ) : null}
        {!profilesLoading && !profilesError && !methods.length ? (
          <p className="s04-home-empty-row">No registered method is reported on this desk yet.</p>
        ) : null}
      </section>
    </section>
  );
}
