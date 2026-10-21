import { GuestSynthesisShowcase } from "@/v2/GuestSynthesisShowcase";
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
      <span className="s04-home-thread-main">
        <strong>{titleFor(thread)}</strong>
        {summary && summary !== titleFor(thread) ? <small>{summary}</small> : null}
      </span>
      <span className="s04-home-thread-state">
        <b>{synthesisWorkspacePhaseLabel(thread)}</b>
        <small>{projectKey ? `Project · ${projectKey} · ` : output ? "Library-bound · " : ""}{updatedLabel(thread)}</small>
      </span>
      <em>{synthesisWorkspaceActionLabel(thread)} →</em>
    </button>
  );
}

function ThreadSection({ title, description, rows, onOpen, priority = false, empty = "" }) {
  return (
    <section className="s04-home-section">
      <header>
        <h2>{title} <span className="s04-home-count">{rows.length}</span></h2>
        {description ? <p>{description}</p> : null}
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
  catalog = [],
  onOpenDataset,
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
  const { needsYou, active, building, results } = partitionSynthesisWorkspace(allThreads);

  const status = [
    needsYou.length ? [`${needsYou.length} ${needsYou.length === 1 ? "needs" : "need"} your decision`, "needs"] : null,
    active.length ? [`${active.length} in progress`, ""] : null,
    building.length ? [`${building.length} running`, ""] : null,
    results.length ? [`${results.length} finished`, ""] : null,
  ].filter(Boolean);

  return (
    <section className="s04-home" data-testid="synthesis-home-state">
      <header className="s04-home-hero">
        <div>
          <h1>Synthesis</h1>
          <p>Turn a research question into a dataset you can reuse.</p>
          {status.length ? (
            <p className="s04-home-status" aria-label="Synthesis workspace status">
              {status.map(([label, tone]) => <span key={label} className={tone}>{label}</span>)}
            </p>
          ) : null}
        </div>
        <button type="button" className="rd-v2-btn primary" onClick={onNew}>
          Start from a research question
        </button>
      </header>

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
          title="Needs your decision"
          description="These builds are waiting on a choice, an approval or a sample check from you."
          rows={needsYou}
          onOpen={onOpenThread}
          priority
        />
      ) : null}

      {allThreads.length ? (
        <ThreadSection
          title="Builds in progress"
          rows={active}
          onOpen={onOpenThread}
          empty={!loading ? "No builds in progress." : ""}
        />
      ) : null}

      {building.length ? (
        <ThreadSection
          title="Running or being checked"
          description="These builds are producing their data, or it is being checked before it is saved to your Library."
          rows={building}
          onOpen={onOpenThread}
        />
      ) : null}

      {results.length ? (
        <ThreadSection
          title="Finished builds"
          rows={results}
          onOpen={onOpenThread}
        />
      ) : null}

      {archivedCount ? (
        <section className="s04-home-section" data-testid="synthesis-home-archived">
          <header>
            <h2>Archived builds <span className="s04-home-count">{archivedCount}</span></h2>
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
            <button type="button" className="rd-v2-linkish" onClick={() => onShowArchived?.()} data-testid="synthesis-show-archived">
              Show archived builds
            </button>
          )}
        </section>
      ) : null}

      <section className="s04-home-section s04-home-methods" id="synthesis-home-methods">
        <header>
          <h2>Start from a saved method <span className="s04-home-count">{methods.length}</span></h2>
          <p>Using one starts a new build. You review its assumptions before anything runs.</p>
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
                <span className="s04-home-thread-main">
                  <strong>{text(profile.title, profile.id)}</strong>
                  <small>{text(profile.description, "Recorded build recipe")}</small>
                </span>
                <em>Use as starting point →</em>
              </button>
            ))}
          </div>
        ) : null}
        {!profilesLoading && !profilesError && !methods.length ? (
          <p className="s04-home-empty-row">No saved methods yet.</p>
        ) : null}
      </section>
      <GuestSynthesisShowcase catalog={catalog} onOpen={onOpenDataset} />
    </section>
  );
}
