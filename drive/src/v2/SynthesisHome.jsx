import { synthesisObjectiveDisplay } from "./uiVocabularyLabels.js";
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
  return synthesisObjectiveDisplay(text(thread?.objective || thread?.state?.objective, "No research objective recorded yet."));
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
      {summary && summary !== titleFor(thread) ? <p>{summary}</p> : null}
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
  archivedCount = 0,
  archivedThreads = null,
  onShowArchived,
  onRestore,
  restoringId = "",
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
            Turn a research question into a dataset you can reuse. Start a new build, continue one, or reuse a saved method.
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
          <span>Describe the dataset you need. You choose the data and approve the method next.</span>
          <em>Start →</em>
        </button>
        <button
          type="button"
          className="s04-home-entry-card"
          onClick={scrollToMethods}
          disabled={!methods.length}
        >
          <small>Saved method</small>
          <strong>Reuse a saved method</strong>
          <span>{methods.length ? `${methods.length} saved ${methods.length === 1 ? "method" : "methods"} can start a new build.` : "No saved methods yet."}</span>
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
        <div className="s04-home-runtime" role="group" aria-label="Assistant status">
          <span><strong>Assistant reasoning is paused.</strong> {reasoningStatus}. You can still create builds and review or map data in your Library.</span>
          <button type="button" className="rd-v2-btn" onClick={() => onOpenResources?.()}>Check Resources</button>
        </div>
      ) : null}

      {loading ? <p className="s04-home-loading">Loading saved builds…</p> : null}
      {!loading && !allThreads.length ? (
        <p className="s04-home-empty-row" data-testid="synthesis-empty-state">
          No builds yet. Start from a research question or a saved method above.
        </p>
      ) : null}

      {needsYou.length ? (
        <ThreadSection
          eyebrow="Decision queue"
          title="Needs your decision"
          description="These builds are waiting on a choice, an approval or a sample check from you."
          rows={needsYou}
          onOpen={onOpenThread}
          priority
        />
      ) : null}

      {allThreads.length ? (
        <ThreadSection
          eyebrow="Active builds"
          title="Builds in progress"
          description="Pick up any build where you left off."
          rows={active}
          onOpen={onOpenThread}
          empty={!loading ? "No builds in progress." : ""}
        />
      ) : null}

      {building.length ? (
        <ThreadSection
          eyebrow="Running"
          title="Running or being checked"
          description="These builds are producing their data, or it is being checked before it is saved to your Library."
          rows={building}
          onOpen={onOpenThread}
        />
      ) : null}

      {results.length ? (
        <ThreadSection
          eyebrow="Finished"
          title="Finished builds"
          description="Each keeps its method and history. The datasets are in your Library."
          rows={results}
          onOpen={onOpenThread}
        />
      ) : null}

      {archivedCount ? (
        <section className="s04-home-section" data-testid="synthesis-home-archived">
          <header>
            <div>
              <small>Archived</small>
              <h2>Archived builds</h2>
              <p>Archived builds keep their history and any data saved to Library. Restore one to work on it again.</p>
            </div>
            <em>{archivedCount}</em>
          </header>
          {Array.isArray(archivedThreads) ? (
            archivedThreads.length ? (
              <ul className="s04-home-archived-list">
                {archivedThreads.map((thread) => (
                  <li key={thread.id}>
                    <span><strong>{titleFor(thread)}</strong><small>{updatedLabel(thread)}</small></span>
                    <button type="button" className="rd-v2-btn" disabled={restoringId === thread.id} onClick={() => onRestore?.(thread.id)}>
                      {restoringId === thread.id ? "Restoring…" : "Restore"}
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="s04-home-empty-row">No archived builds.</p>
          ) : (
            <button type="button" className="rd-v2-btn" onClick={() => onShowArchived?.()} data-testid="synthesis-show-archived">
              Show archived builds
            </button>
          )}
        </section>
      ) : null}

      <section className="s04-home-section s04-home-methods" id="synthesis-home-methods">
        <header>
          <div>
            <h2>Start from a saved method</h2>
            <p>Using one starts a new build. You review its assumptions before anything runs.</p>
          </div>
          <em>{methods.length}</em>
        </header>
        {profilesLoading ? <p className="s04-home-empty-row">Loading saved methods…</p> : null}
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
                <strong>{text(profile.title, profile.id)}</strong>
                <span>{text(profile.description, "Recorded build recipe")}</span>
                <em>Use as starting point →</em>
              </button>
            ))}
          </div>
        ) : null}
        {!profilesLoading && !profilesError && !methods.length ? (
          <p className="s04-home-empty-row">No saved methods yet.</p>
        ) : null}
      </section>
    </section>
  );
}
