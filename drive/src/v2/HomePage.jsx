import { useEffect, useMemo, useState } from "react";
import { listSynthesisThreads } from "@/v2/api";
import { resolveCapacityMark } from "@/v2/capacityMarks";
import { GuidedState, Skeleton } from "@/v2/InteractionFeedback";
import { HomeSuggestedAsks } from "@/v2/HomeSuggestedAsks";
import { readResourcesRollupCache, writeResourcesRollupCache } from "@/v2/resourcesRollupCache";
import { PageShell } from "@/v2/ui";
import { DeskError } from "@/v2/DeskError";
import { resolveSurfaceLifecycle } from "@/v2/surfaceLifecycle";
import {
  buildPickUp,
  buildRecentTrail,
  buildRecommendedEvidence,
  buildResourceHeadroom,
  projectRollupFromHealth,
} from "@/v2/homeIteration10";

function HeadroomBar({ pct, warn }) {
  if (pct == null || !Number.isFinite(pct)) return null;
  const width = Math.max(0, Math.min(100, pct));
  return (
    <div className={`rd-v2-home-headroom-bar${warn ? " warn" : ""}`} aria-hidden>
      <span style={{ width: `${width}%` }} />
    </div>
  );
}

function HomeHeadroomMark({ markId }) {
  const mark = resolveCapacityMark(markId);
  if (!mark) return null;
  return (
    <span className="rd-v2-home-headroom-mark" aria-hidden>
      <img src={mark.src} alt="" title={mark.title || mark.alt} width={16} height={16} />
    </span>
  );
}

function PickUpCard({ point, loading, onContinue, onReview }) {
  if (loading) {
    return (
      <div className="rd-v2-home-pickup-card" data-testid="home-continue" aria-busy="true">
        <span className="rd-v2-home-eyebrow">Pick up</span>
        <Skeleton lines={3} label="Loading resume point" />
      </div>
    );
  }
  if (!point) {
    return (
      <div className="rd-v2-home-pickup-card" data-testid="home-continue">
        <span className="rd-v2-home-eyebrow">Pick up</span>
        <GuidedState
          eyebrow="No resume point"
          title="Open the Library or find missing evidence"
          detail="No durable research work currently needs resumption."
          checks={["Library holds registered evidence", "Discover searches beyond holdings", "Synthesis holds durable constructions"]}
        />
      </div>
    );
  }
  return (
    <article
      className={`rd-v2-home-pickup-card${point.warn ? " warn" : ""}`}
      data-testid="home-continue"
      data-kind={point.kind}
      data-resume-id={point.id || ""}
      aria-label={`Pick up: ${point.title}`}
    >
      <span className="rd-v2-home-eyebrow">Pick up</span>
      <h2>{point.title}</h2>
      <p className="rd-v2-home-pickup-state">{point.stateSummary}</p>
      <div className="rd-v2-home-pickup-foot">
        <div>
          {point.pill ? <span className="rd-v2-pill">{point.pill}</span> : null}
          <span className="rd-v2-home-pickup-loc">{point.location}</span>
        </div>
        {point.action === "review" ? (
          <button type="button" className="rd-v2-btn sm primary" onClick={() => onReview?.(point)}>
            Review
          </button>
        ) : (
          <button type="button" className="rd-v2-btn sm primary" onClick={() => onContinue?.(point)}>
            Continue
          </button>
        )}
      </div>
      {point.dataset?.dataset_id ? (
        <p className="rd-v2-home-continue-id mono">{point.dataset.dataset_id}</p>
      ) : point.thread?.id ? (
        <p className="rd-v2-home-continue-id mono">{point.thread.id}</p>
      ) : null}
    </article>
  );
}

function threadRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.threads)) return payload.threads;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

export function HomePage({
  datasets = [],
  catalogLoading = false,
  health,
  jobs = [],
  profile,
  acquisitions = [],
  resourcesRollup,
  pendingDecisionCount = null,
  loadError = "",
  onGoTab,
  onOpenAttention,
  onSelectDataset,
  onPreviewDataset,
  onPrimaryResume,
  onResumeSynthesisThread,
  onSuggestSearch,
  onAskComposer,
  canUseAsk = true,
}) {
  const loading = catalogLoading || (health == null && datasets.length === 0);
  const surfaceState = resolveSurfaceLifecycle({ loading, error: loadError, count: datasets.length });
  const [synthesisThreads, setSynthesisThreads] = useState([]);

  // Home consumes the durable Synthesis authority directly. Failure is soft:
  // Library/Discover continuity remains truthful even if Synthesis is temporarily unavailable.
  useEffect(() => {
    // Durable Synthesis threads are personal reasoning state.  Public guests
    // can browse the shared estate without creating a protected prefetch.
    if (!canUseAsk) return undefined;
    let cancelled = false;
    let retryTimer = null;
    let attempts = 0;
    const loadThreads = () => {
      listSynthesisThreads({ limit: 20 })
        .then((payload) => {
          if (!cancelled) setSynthesisThreads(threadRows(payload));
        })
        .catch(() => {
          // Home is allowed to remain useful when Synthesis is down, but a
          // transient front-door failure must not permanently demote an
          // existing proposal behind passive Library recency. Retry once;
          // ongoing polling belongs to the Synthesis workspace itself.
          if (!cancelled && attempts < 1) {
            attempts += 1;
            retryTimer = window.setTimeout(loadThreads, 800);
          }
        });
    };
    loadThreads();
    return () => {
      cancelled = true;
      if (retryTimer != null) window.clearTimeout(retryTimer);
    };
  }, [canUseAsk]);

  const [cachedRollup, setCachedRollup] = useState(() => readResourcesRollupCache());
  useEffect(() => {
    if (resourcesRollup && typeof resourcesRollup === "object") {
      writeResourcesRollupCache(resourcesRollup);
      setCachedRollup(resourcesRollup);
    }
  }, [resourcesRollup]);
  const headroomRollup = useMemo(() => {
    if (resourcesRollup && typeof resourcesRollup === "object") return resourcesRollup;
    if (cachedRollup) return cachedRollup;
    return projectRollupFromHealth(health);
  }, [resourcesRollup, cachedRollup, health]);
  const headroomLoading = headroomRollup == null && resourcesRollup === undefined && health == null;
  const pickUp = useMemo(
    () => buildPickUp({
      datasets,
      jobs,
      health,
      acquisitions,
      profile,
      synthesisThreads,
      pendingDecisionCount,
    }),
    [datasets, jobs, health, acquisitions, profile, synthesisThreads, pendingDecisionCount],
  );
  useEffect(() => {
    if (!loading) onPrimaryResume?.(pickUp.primary || null);
  }, [loading, onPrimaryResume, pickUp.primary]);
  const headroom = useMemo(
    () => buildResourceHeadroom(headroomRollup, health),
    [headroomRollup, health],
  );
  const recommended = useMemo(
    () => buildRecommendedEvidence(profile, { limit: 2 }),
    [profile],
  );
  const trail = useMemo(
    () => buildRecentTrail({ jobs, datasets, limit: 3 }),
    [jobs, datasets],
  );

  const continuePrimary = (point) => {
    if (point?.thread?.id) {
      // Navigation remains a shell responsibility; the typed callback only
      // binds the exact durable Synthesis object. Keeping these authorities
      // separate prevents Home from inventing a second navigation path.
      onResumeSynthesisThread?.(point.thread);
      onGoTab?.("synthesis");
      return;
    }
    if (!point?.dataset) {
      onGoTab?.(point?.tab || "library");
      return;
    }
    if (onPreviewDataset) {
      onPreviewDataset(point.dataset);
      return;
    }
    onSelectDataset?.(point.dataset);
  };

  const reviewDecision = (point) => {
    if (onOpenAttention) {
      onOpenAttention({
        id: point.id,
        kind: point.kind || "attention",
        tab: "browse",
        discoverMode: "history",
        title: point.title,
        resourceRow: {
          kind: "active",
          key: point.job?.id ? `job-${point.job.id}` : "jobs-pending",
          label: point.title,
          metric: point.pill,
          section: "active",
          warn: true,
          ok: false,
          job: point.job,
        },
      });
      return;
    }
    onGoTab?.("browse");
  };

  return (
    <PageShell
      className="rd-v2-home-page rd-v2-home-i10"
      title="Home"
      lead="Resume · headroom · durable consequences"
      footer={null}
      surfaceState={surfaceState}
    >
      {loadError ? <DeskError raw={loadError} surface="Home's Library briefing" /> : null}
      <div className="rd-v2-home-topband">
        <section className="rd-v2-home-pickup" aria-label="Pick up">
          <PickUpCard
            point={pickUp.primary}
            loading={loading}
            onContinue={continuePrimary}
            onReview={reviewDecision}
          />
          {pickUp.secondary ? (
            <button
              type="button"
              className={`rd-v2-home-pickup-secondary${pickUp.secondary.warn ? " warn" : ""}`}
              onClick={() =>
                pickUp.secondary.action === "review"
                  ? reviewDecision(pickUp.secondary)
                  : continuePrimary(pickUp.secondary)
              }
            >
              <strong>{pickUp.secondary.title}</strong>
              <span>{pickUp.secondary.stateSummary}</span>
              <em>
                {pickUp.secondary.location}
                {pickUp.secondary.action === "review" ? " · Review" : " · Continue →"}
              </em>
            </button>
          ) : null}
        </section>

        <section className="rd-v2-home-headroom" aria-label="Resource headroom">
          <div className="rd-v2-home-headroom-head">
            <span className="rd-v2-home-eyebrow">Resource headroom</span>
            <button type="button" className="rd-v2-linkish" onClick={() => onGoTab?.("resources")}>
              Resources →
            </button>
          </div>
          {loading || headroomLoading ? (
            <Skeleton lines={3} label="Loading headroom" />
          ) : headroom.length ? (
            <ul className="rd-v2-home-headroom-list">
              {headroom.map((slot) => (
                <li key={slot.id} className={slot.warn ? "warn" : undefined}>
                  <div className="rd-v2-home-headroom-row">
                    <strong>
                      {slot.markId ? <HomeHeadroomMark markId={slot.markId} /> : null}
                      {slot.name}
                    </strong>
                    <span>{slot.metric}</span>
                  </div>
                  <HeadroomBar pct={slot.pct} warn={slot.warn} />
                  <div className="rd-v2-home-headroom-meta">
                    <span>{slot.headroom}</span>
                    <button
                      type="button"
                      className="rd-v2-linkish"
                      onClick={() => onGoTab?.("resources")}
                    >
                      {slot.action === "check" ? "Check →" : "Resources →"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rd-v2-home-headroom-empty">Capacity signals load with Resources.</p>
          )}
        </section>
      </div>

      {recommended.length ? (
        <section className="rd-v2-home-recommended" aria-label="Recommended evidence">
          <div className="rd-v2-home-section-head">
            <h2>Recommended evidence</h2>
          </div>
          <ul className="rd-v2-home-recommended-list">
            {recommended.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="rd-v2-home-recommended-row"
                  onClick={() => {
                    if (item.action === "library" && item.datasetId) {
                      onGoTab?.("library");
                      return;
                    }
                    if (item.query && onSuggestSearch) {
                      onSuggestSearch(item.query);
                      return;
                    }
                    onGoTab?.("browse");
                  }}
                >
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.reason}</span>
                  </div>
                  <em>{item.badge}</em>
                  <span className="rd-v2-home-recommended-go">
                    {item.action === "library" ? "Library →" : "Explore →"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rd-v2-home-trail" aria-label="Recent trail">
        <div className="rd-v2-home-section-head">
          <h2>Recent trail</h2>
          <button
            type="button"
            className="rd-v2-linkish"
            onClick={() => onGoTab?.("browse")}
          >
            View all →
          </button>
        </div>
        {trail.length ? (
          <ul className="rd-v2-home-trail-list">
            {trail.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="rd-v2-home-trail-row"
                  onClick={() => {
                    if (item.dataset) {
                      onSelectDataset?.(item.dataset);
                      return;
                    }
                    if (item.dest === "history") {
                      onGoTab?.("browse");
                      return;
                    }
                    onGoTab?.(item.dest === "library" ? "library" : "browse");
                  }}
                >
                  <span className="rd-v2-home-trail-kind">{item.kind}</span>
                  <strong>{item.title}</strong>
                  <span>{item.summary}</span>
                  <em>{item.dest === "library" ? "Library →" : "History →"}</em>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rd-v2-home-section-empty-actions">
            <p className="rd-v2-home-section-empty">
              Nothing durable yet — recent work will collect here.
            </p>
            <HomeSuggestedAsks
              profile={profile}
              onAskComposer={onAskComposer || onSuggestSearch}
              canLoadPrincipalSeed={canUseAsk}
            />
          </div>
        )}
      </section>
    </PageShell>
  );
}
