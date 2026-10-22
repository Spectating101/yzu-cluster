import { useRef } from "react";
import { handleEnterToSubmit } from "@/v2/enterToSubmit";
import { GuestSynthesisShowcase } from "@/v2/GuestSynthesisShowcase";
import { synthesisObjectiveDisplay } from "./uiVocabularyLabels.js";
import { DeskError } from "@/v2/DeskError";
import {
  partitionSynthesisWorkspace,
  synthesisWorkspaceActionLabel,
  synthesisWorkspaceDecisionSummary,
  synthesisWorkspacePhase,
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

function BuildRow({ thread, onOpen, onReuse, priority = false }) {
  const output = outputFor(thread);
  const projectKey = text(thread?.project_key || thread?.state?.project_key);
  const summary = priority
    ? synthesisWorkspaceDecisionSummary(thread) || objectiveFor(thread)
    : objectiveFor(thread);
  const finished = synthesisWorkspacePhase(thread) === "result";
  return (
    <li className={`s04-build-row${priority ? " is-priority" : ""}`} data-testid="synthesis-home-thread">
      <button type="button" className={`s04-home-thread${priority ? " is-priority" : ""}`} onClick={() => onOpen?.(thread.id)}>
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
      {finished ? (
        <button type="button" className="rd-v2-linkish s04-build-reuse" onClick={() => onReuse?.(thread)}>
          Use in a new build
        </button>
      ) : null}
    </li>
  );
}

function BuildSection({ title, rows, onOpen, onReuse, priority = false }) {
  if (!rows.length) return null;
  return (
    <section className="s04-home-section">
      <h2>{title} <span className="s04-home-count">{rows.length}</span></h2>
      <ul className="s04-home-thread-grid s04-build-list">
        {rows.map((thread) => (
          <BuildRow key={thread.id} thread={thread} onOpen={onOpen} onReuse={onReuse} priority={priority} />
        ))}
      </ul>
    </section>
  );
}

export function SynthesisHome({
  catalog = [],
  onOpenDataset,
  threads = [],
  loading = false,
  profiles = [],
  profilesError = "",
  reasoningAvailable = false,
  reasoningStatus = "Assistant runtime not verified",
  onOpenThread,
  onStartBlueprint,
  onOpenResources,
  archivedCount = 0,
  archivedThreads = null,
  onShowArchived,
  onRestore,
  restoringId = "",
  objective = "",
  setObjective,
  busy = false,
  onCreate,
}) {
  const allThreads = Array.isArray(threads) ? threads : [];
  const methods = Array.isArray(profiles) ? profiles : [];
  const { needsYou, active, building, results } = partitionSynthesisWorkspace(allThreads);
  const composerRef = useRef(null);

  const status = [
    needsYou.length ? [`${needsYou.length} ${needsYou.length === 1 ? "needs" : "need"} your decision`, "needs"] : null,
    active.length ? [`${active.length} in progress`, ""] : null,
    building.length ? [`${building.length} running`, ""] : null,
    results.length ? [`${results.length} finished`, ""] : null,
  ].filter(Boolean);

  const reuse = (thread) => {
    setObjective?.(`Build on "${titleFor(thread)}": `);
    composerRef.current?.focus();
  };

  return (
    <section className="s04-home" data-testid="synthesis-home-state">
      <header className="s04-home-hero">
        <h1>Synthesis</h1>
        {status.length ? (
          <p className="s04-home-status" aria-label="Synthesis workspace status">
            {status.map(([label, tone]) => <span key={label} className={tone}>{label}</span>)}
          </p>
        ) : null}
      </header>

      <section className="s04-compose" data-testid="synthesis-intent-state" aria-label="New build">
        <label htmlFor="synthesis-objective">What dataset do you need, and what is it for?</label>
        <textarea
          id="synthesis-objective"
          ref={composerRef}
          rows={3}
          value={objective}
          onChange={(event) => setObjective?.(event.target.value)}
          placeholder="e.g. weekly news shocks for Asian markets, to see if they lead returns"
          onKeyDown={(event) => {
            handleEnterToSubmit(event, () => {
              if (!busy && objective.trim()) onCreate?.();
            });
          }}
        />
        <div className="s04-compose-row">
          {methods.length ? (
            <label className="s04-compose-method">
              Start from
              <select
                value=""
                disabled={busy}
                data-testid="synthesis-home-methods"
                aria-label="Start from a saved method"
                onChange={(event) => {
                  const profile = methods.find((item) => String(item.id) === event.target.value);
                  if (profile) onStartBlueprint?.(profile);
                }}
              >
                <option value="">Saved method · {methods.length}</option>
                {methods.map((profile) => (
                  <option key={profile.id} value={profile.id}>{text(profile.title, profile.id)}</option>
                ))}
              </select>
            </label>
          ) : <span />}
          <button
            type="button"
            className="rd-v2-btn primary"
            disabled={busy || !objective.trim()}
            onClick={onCreate}
            title={objective.trim() ? undefined : "Enter what the dataset is for to continue"}
          >
            Create build
          </button>
        </div>
        {profilesError ? <DeskError raw={profilesError} surface="Synthesis methods saved to Library" /> : null}
        {!reasoningAvailable ? (
          <p className="s04-home-runtime" role="group" aria-label="Assistant status">
            <span>Assistant reasoning is paused. {reasoningStatus}. You can still create builds.</span>
            <button type="button" className="rd-v2-linkish" onClick={() => onOpenResources?.()}>Check Resources</button>
          </p>
        ) : null}
      </section>

      {loading ? <p className="s04-home-loading">Loading saved builds…</p> : null}
      {!loading && !allThreads.length ? (
        <p className="s04-home-empty-row" data-testid="synthesis-empty-state">No builds yet.</p>
      ) : null}

      <BuildSection title="Needs your decision" rows={needsYou} onOpen={onOpenThread} onReuse={reuse} priority />
      <BuildSection title="In progress" rows={active} onOpen={onOpenThread} onReuse={reuse} />
      <BuildSection title="Running or being checked" rows={building} onOpen={onOpenThread} onReuse={reuse} />
      <BuildSection title="Finished" rows={results} onOpen={onOpenThread} onReuse={reuse} />

      {archivedCount ? (
        <section className="s04-home-section" data-testid="synthesis-home-archived">
          <h2>Archived builds <span className="s04-home-count">{archivedCount}</span></h2>
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
      <GuestSynthesisShowcase catalog={catalog} onOpen={onOpenDataset} />
    </section>
  );
}
