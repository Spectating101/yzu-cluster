import { useMemo, useRef, useState } from "react";
import {
  reviewDiscoverIntentProposal,
  selectDiscoverIntentRoute,
  submitDiscoverIntent,
} from "@/v2/api";
import {
  canSubmitDiscoverIntent,
  intentCollection,
  intentState,
  selectedIntentRoute,
} from "@/v2/discoverIntent";
import { buildDiscoverDecisionCapacity } from "@/v2/discoverDecisionCapacity";

function text(value, fallback = "") {
  return String(value || "").trim() || fallback;
}

function Fact({ label, value, unknown = false }) {
  if (!value) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd className={unknown ? "is-unknown" : ""}>{value}</dd>
    </div>
  );
}

function routeTitle(route, sourceTitle = "") {
  const raw = text(route?.title, "Untitled acquisition route");
  return /^collect through [a-z0-9_-]+$/i.test(raw) && sourceTitle
    ? `Collect from ${sourceTitle}`
    : raw;
}

function RouteCard({ route, sourceTitle, selected, recommended = false, disabled, onSelect }) {
  const highlighted = selected || recommended;
  return (
    <article className={`rd-v2-intent-route${highlighted ? " is-selected" : ""}`}>
      <header>
        <div>
          <span className="rd-v2-eyebrow">
            {selected ? "Selected route" : recommended ? "Recommended route" : "Available route"}
          </span>
          <h3>{routeTitle(route, sourceTitle)}</h3>
        </div>
        {!selected && onSelect ? (
          <button type="button" disabled={disabled} onClick={onSelect}>Select route</button>
        ) : null}
      </header>
      {route.summary ? <p>{route.summary}</p> : null}
      <dl>
        <Fact label="Coverage" value={route.coverage} />
        <Fact label="Grain" value={route.grain} />
        <Fact label="Access" value={route.access} />
        <Fact label="Destination" value={route.destination} />
        <Fact label="Refresh" value={route.refresh} />
        <Fact label="Cost" value={route.cost} unknown />
        <Fact label="Limitation" value={route.limitation} unknown />
      </dl>
    </article>
  );
}

export function DiscoverIntentWorkspace({
  record,
  onChange,
  onBack,
  onAsk,
  onSubmitted,
  onOpenHistory,
  resourcesRollup = null,
  deskHealth = null,
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const operationLockRef = useRef(false);
  const intent = record?.intent || null;
  const state = intentState(intent);
  const candidate = state.candidate || record?.candidate || {};
  const proposal = state.proposal || null;
  const routes = state.routes || [];
  const collection = intentCollection(intent);
  const selectedRoute = selectedIntentRoute(intent);
  const title = text(candidate.title || intent?.title, "Acquisition review");
  const description = text(
    candidate.description,
    "The catalog does not provide a description for this offering.",
  );
  const use = text(candidate.recommended_use);
  const registeredId = text(collection.registered_dataset_id);
  const jobStatus = text(record?.job?.status || intent?.job?.status || collection.status);
  const proposalRoutes = useMemo(() => proposal?.routes || [], [proposal]);
  const capacityRows = useMemo(
    () => buildDiscoverDecisionCapacity(resourcesRollup, deskHealth, { routes: proposalRoutes.length ? proposalRoutes : routes }),
    [resourcesRollup, deskHealth, proposalRoutes, routes],
  );

  const review = async (decision) => {
    if (!proposal?.id || !proposal?.proposal_hash || !intent?.id || operationLockRef.current) return;
    operationLockRef.current = true;
    setBusy(`review:${decision}`);
    setError("");
    try {
      const next = await reviewDiscoverIntentProposal(intent.id, {
        decision,
        proposalId: proposal.id,
        proposalHash: proposal.proposal_hash,
      });
      onChange?.({ ...record, intent: next });
    } catch (failure) {
      setError(failure?.message || "Could not review this route proposal.");
    } finally {
      operationLockRef.current = false;
      setBusy("");
    }
  };

  const selectRoute = async (routeId) => {
    if (!intent?.id || operationLockRef.current) return;
    operationLockRef.current = true;
    setBusy(`route:${routeId}`);
    setError("");
    try {
      const next = await selectDiscoverIntentRoute(intent.id, routeId);
      onChange?.({ ...record, intent: next });
    } catch (failure) {
      setError(failure?.message || "Could not select this route.");
    } finally {
      operationLockRef.current = false;
      setBusy("");
    }
  };

  const submit = async () => {
    if (!intent?.id || !canSubmitDiscoverIntent(intent) || operationLockRef.current) return;
    operationLockRef.current = true;
    setBusy("submit");
    setError("");
    try {
      const out = await submitDiscoverIntent(intent.id, { limit: 200 });
      const nextRecord = {
        ...record,
        intent: out?.intent || intent,
        job: out?.job || null,
      };
      onChange?.(nextRecord);
      onSubmitted?.(out?.job || null, nextRecord);
    } catch (failure) {
      setError(failure?.message || "Could not submit this route for approval.");
    } finally {
      operationLockRef.current = false;
      setBusy("");
    }
  };

  return (
    <section className="rd-v2-intent-workspace" data-testid="discover-intent-workspace">
      <header className="rd-v2-intent-workspace-head">
        <button type="button" className="rd-v2-linkish" onClick={onBack}>← Back to results</button>
        <div>
          <span className="rd-v2-eyebrow">Acquisition review</span>
          <h2>{title}</h2>
          <p>{description}</p>
          {use ? <p className="rd-v2-intent-use"><b>How to use it</b> {use}</p> : null}
        </div>
        <div className="rd-v2-intent-identity">
          <strong>{text(state.status, "draft").replaceAll("_", " ")}</strong>
        </div>
      </header>

      <section className="rd-v2-intent-need">
        <span className="rd-v2-eyebrow">Research need</span>
        <p>{text(intent?.research_need || record?.researchNeed, "Research need not recorded")}</p>
      </section>

      {capacityRows.length ? (
        <section className="rd-v2-intent-capacity" aria-label="Execution capacity">
          <header><div><span className="rd-v2-eyebrow">Execution capacity</span><h3>Can the desk support this acquisition path?</h3></div></header>
          <div>
            {capacityRows.map((row) => (
              <article key={row.id} className={row.attention ? "needs-attention" : ""}>
                <span>{row.label}</span><strong>{row.metric}</strong>{row.detail ? <em>{row.detail}</em> : null}
              </article>
            ))}
          </div>
          <p>Capacity is context only. No worker, quota, or storage tier is assigned until a reviewed route becomes an approved job.</p>
        </section>
      ) : null}

      {error ? <p className="rd-v2-intent-error">{error}</p> : null}

      {proposal ? (
        <section className="rd-v2-intent-proposal" aria-label="Proposed acquisition routes">
          <header>
            <div>
              <span className="rd-v2-eyebrow">Proposed routes · review required</span>
              <h3>{proposal.summary}</h3>
              {proposal.reason ? <p>{proposal.reason}</p> : null}
            </div>
          </header>
          <div className="rd-v2-intent-route-list">
            {proposalRoutes.map((route) => (
              <RouteCard
                key={route.id}
                route={route}
                sourceTitle={title}
                recommended={route.id === proposal.recommended_route_id}
                disabled
              />
            ))}
          </div>
          <footer>
            <p>Continue to record this proposal and choose one route. Collection will not start.</p>
            <button type="button" className="rd-v2-btn primary" disabled={Boolean(busy)} onClick={() => review("accept")}>
              {busy === "review:accept" ? "Recording…" : "Continue to route selection"}
            </button>
            <button type="button" className="rd-v2-btn" disabled={Boolean(busy)} onClick={() => review("reject")}>
              Reject proposal
            </button>
          </footer>
        </section>
      ) : routes.length ? (
        <section className="rd-v2-intent-reviewed" aria-label="Reviewed acquisition routes">
          <header>
            <span className="rd-v2-eyebrow">Reviewed routes</span>
            <h3>Choose the concrete route to submit</h3>
          </header>
          <div className="rd-v2-intent-route-list">
            {routes.map((route) => (
              <RouteCard
                key={route.id}
                route={route}
                sourceTitle={title}
                selected={route.id === state.selected_route_id}
                disabled={Boolean(busy) || Boolean(collection.job_id)}
                onSelect={() => selectRoute(route.id)}
              />
            ))}
          </div>
          {!collection.job_id ? (
            <div className="rd-v2-intent-submit">
              <div>
                <strong>{selectedRoute ? routeTitle(selectedRoute, title) : "Select a route"}</strong>
                <span>Submission creates a pending-approval job. It does not approve the collection.</span>
              </div>
              <button
                type="button"
                className="rd-v2-btn primary"
                disabled={Boolean(busy) || !canSubmitDiscoverIntent(intent)}
                onClick={submit}
              >
                {busy === "submit" ? "Submitting…" : "Submit for approval"}
              </button>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="rd-v2-intent-empty">
          <span className="rd-v2-eyebrow">No supported route recorded</span>
          <h3>This intent is durable, but it has no reviewed acquisition route yet.</h3>
          <p>Ask the desk to investigate a connector, public URL, entitlement, or implementation path. No collection can be submitted from this state.</p>
          <button type="button" className="rd-v2-btn" onClick={() => onAsk?.(record)}>
            Ask the desk to investigate →
          </button>
        </section>
      )}

      {collection.job_id ? (
        <section className="rd-v2-intent-collection" data-testid="discover-intent-collection">
          <div>
            <span className="rd-v2-eyebrow">Collection lifecycle</span>
            <h3>{registeredId ? "Registered in Library" : text(jobStatus, "pending approval").replaceAll("_", " ")}</h3>
            <p>
              Job {collection.job_id}
              {registeredId ? ` · registered as ${registeredId}` : " · collection remains governed by History and approval state"}
            </p>
          </div>
          <button type="button" className="rd-v2-btn" onClick={() => onOpenHistory?.(record)}>
            Open in History →
          </button>
        </section>
      ) : null}

      {intent?.id ? (
        <details className="rd-v2-intent-technical">
          <summary>Technical details</summary>
          <dl>
            <Fact label="Intent ID" value={intent.id} />
            <Fact label="Candidate key" value={candidate.candidate_key} />
            <Fact label="Selected route" value={selectedRoute?.id} />
            <Fact label="Connector" value={selectedRoute?.connector_id} />
          </dl>
        </details>
      ) : null}
    </section>
  );
}
