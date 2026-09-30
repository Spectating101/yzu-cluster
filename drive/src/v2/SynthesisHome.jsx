import { DeskError } from "@/v2/DeskError";
import {
  partitionSynthesisWorkspace,
  synthesisWorkspaceActionLabel,
  synthesisWorkspaceDecisionSummary,
  synthesisWorkspacePhaseLabel,
} from "@/v2/synthesisWorkspace.js";

function text(value, fallback = "") {
  return String(value || "").trim() || fallback;
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

function updatedLabel(thread) {
  const raw = thread?.updated_at || thread?.created_at;
  if (!raw) return "Saved thread";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "Saved thread";
  return `Updated ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function ThreadCard({ thread, onOpen, priority = false }) {
  const output = outputFor(thread);
  const projectKey = text(thread?.project_key || thread?.state?.project_key);
  const summary = priority
    ? synthesisWorkspaceDecisionSummary(thread) || objectiveFor(thread)
    : objectiveFor(thread);
  return (
    <button
      type="button"
      className={`s04-home-thread${priority ? " is-priority" : ""}`}
      onClick={() => onOpen?.(thread.id)}
      data-testid="synthesis-home-thread"
    >
      <span className="s04-home-thread-state">
        <b>{synthesisWorkspacePhaseLabel(thread)}</b>
        <small>{updatedLabel(thread)}</small>
      </span>
      <strong>{titleFor(thread)}</strong>
      <p>{summary}</p>
      <span className="s04-home-thread-foot">
        <small>{projectKey ? `Project · ${projectKey}` : output ? "Library-bound output" : "Saved build"}</small>
        <em>{synthesisWorkspaceActionLabel(thread)} →</em>
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
  const { needsYou, active, building, results, continueThread } = partitionSynthesisWorkspace(allThreads);

  const scrollToMethods = () => {
    document.getElementById("synthesis-home-methods")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="s04-home" data-testid="synthesis-home-state">
      <header className="s04-home-hero">
        <div>
          <h1>Synthesis</h1>
          <p>
            Build research datasets from questions, evidence, and reusable methods. Start a new build, return to a saved build, or reuse a method saved to Library.
          </p>
        </div>
        {allThreads.length ? (
          <dl aria-label="Synthesis workspace status">
            <div><dt>Active</dt><dd>{active.length}</dd></div>
            <div className={needsYou.length ? "needs" : ""}><dt>Needs you</dt><dd>{needsYou.length}</dd></div>
            <div><dt>In flight</dt><dd>{building.length}</dd></div>
            <div><dt>Results</dt><dd>{results.length}</dd></div>
          </dl>
        ) : null}
      </header>

      <section className="s04-home-entry" aria-label="Start or continue Synthesis work">
        <button
          type="button"
          className="s04-home-entry-card primary"
          onClick={onNew}
        >
          <small>New build</small>
          <strong>Start from a research question</strong>
          <span>Describe the object you need. Evidence and method become explicit decisions after creation.</span>
          <em>Start →</em>
        </button>
        <button
          type="button"
          className="s04-home-entry-card"
          onClick={scrollToMethods}
          disabled={!methods.length}
        >
          <small>Reusable method</small>
          <strong>Start from work saved to Library</strong>
          <span>{methods.length ? `${methods.length} method saved to Library${methods.length === 1 ? "" : "s"} can start a new build.` : "No method saved to Library is reported yet."}</span>
          <em>{methods.length ? "Browse methods ↓" : "None available"}</em>
        </button>
        {continueThread ? (
          <button
            type="button"
            className="s04-home-entry-card"
            onClick={() => onOpenThread?.(continueThread.id)}
          >
            <small>Saved work</small>
            <strong>{needsYou.length ? "Return to what needs you" : "Continue a build"}</strong>
            <span>{titleFor(continueThread)}</span>
            <em>{`${synthesisWorkspaceActionLabel(continueThread)} →`}</em>
          </button>
        ) : null}
      </section>

      {!reasoningAvailable ? (
        <aside className="s04-home-runtime">
          <span><strong>Assistant reasoning is paused.</strong> {reasoningStatus}. You can still create builds and review or map data in your Library.</span>
          <button type="button" className="rd-v2-btn" onClick={() => onOpenResources?.()}>Check Resources</button>
        </aside>
      ) : null}

      {loading ? <p className="s04-home-loading">Loading saved builds…</p> : null}

      {needsYou.length ? (
        <ThreadSection
          eyebrow="Decision queue"
          title="Needs your decision"
          description="Review build choices, proposals, sample checks, approvals, and issues that need attention here."
          rows={needsYou}
          onOpen={onOpenThread}
          priority
        />
      ) : null}

      {allThreads.length ? (
        <ThreadSection
          eyebrow="Active builds"
          title="Research objects in progress"
          description="Evidence mapping and method design remain independently resumable when no explicit researcher decision is blocking them."
          rows={active}
          onOpen={onOpenThread}
          empty={!loading ? "No build is currently in research or method design." : ""}
        />
      ) : null}

      {building.length ? (
        <ThreadSection
          eyebrow="Execution and Library checks"
          title="Running or verifying"
          description="Execution, completion, and Library checks remain in progress until result evidence is saved."
          rows={building}
          onOpen={onOpenThread}
        />
      ) : null}

      {results.length ? (
        <ThreadSection
          eyebrow="Outputs saved to Library"
          title="Reusable research data"
          description="Completed builds keep their method and execution history. Their resulting datasets appear in Library."
          rows={results}
          onOpen={onOpenThread}
        />
      ) : null}

      <section className="s04-home-section s04-home-methods" id="synthesis-home-methods">
        <header>
          <div>
            <small>Reusable methods</small>
            <h2>Starting points saved to Library</h2>
            <p>Using a method creates a new saved build. You review its assumptions before any work runs.</p>
          </div>
          <em>{methods.length}</em>
        </header>
        {profilesLoading ? <p className="s04-home-empty-row">Loading methods saved to Library…</p> : null}
        {profilesError ? <DeskError raw={profilesError} surface="Synthesis methods saved to Library" /> : null}
        {!profilesLoading && !profilesError && methods.length ? (
          <div className="s04-home-method-grid" data-testid="synthesis-home-methods">
            {methods.map((profile) => (
              <button
                type="button"
                key={profile.id}
                onClick={() => onStartBlueprint?.(profile)}
                title={text(profile.title, profile.id)}
              >
                <small>Method saved to Library</small>
                <strong>{text(profile.title, profile.id)}</strong>
                <span>{text(profile.description, "Recorded build recipe")}</span>
                <em>Use as starting point →</em>
              </button>
            ))}
          </div>
        ) : null}
        {!profilesLoading && !profilesError && !methods.length ? (
          <p className="s04-home-empty-row">No method saved to Library is reported by Research Drive yet.</p>
        ) : null}
      </section>
    </section>
  );
}
