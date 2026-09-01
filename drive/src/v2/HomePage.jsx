import { useEffect, useMemo, useState } from "react";
import { listSynthesisThreads } from "@/v2/api";
import { resolveCapacityMark } from "@/v2/capacityMarks";
import { displayName, statusPill } from "@/v2/datasetMeta";
import { Skeleton } from "@/v2/InteractionFeedback";
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

function threadRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.threads)) return payload.threads;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function firstObserved(...values) {
  for (const value of values) {
    if (value === 0) return value;
    if (value !== null && value !== undefined && String(value).trim() !== "") return value;
  }
  return null;
}

function shortDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || raw;
}

function researcherName(profile) {
  return String(
    firstObserved(
      profile?.display_name,
      profile?.name,
      profile?.full_name,
      profile?.scholar?.name,
      profile?.researcher?.name,
      profile?.faculty?.name,
    ) || "",
  ).trim();
}

function assetText(dataset) {
  return [
    dataset?.dataset_id,
    dataset?.name,
    dataset?.title,
    dataset?.display_name,
    dataset?.source,
    dataset?.publisher,
    dataset?.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function selectFocalAsset(datasets, pickUp) {
  const held = (datasets || []).filter(Boolean);
  const preferred = held.find((dataset) => {
    const text = assetText(dataset);
    return text.includes("mops") && (text.includes("financial") || text.includes("statement"));
  });
  return preferred || pickUp?.primary?.dataset || held[0] || null;
}

function assetSummary(dataset) {
  return String(
    firstObserved(
      dataset?.summary,
      dataset?.description,
      dataset?.purpose,
      dataset?.recommended_use,
      dataset?.research_use,
    ) || "Durable Library evidence ready for inspection.",
  ).trim();
}

function focalFacts(dataset) {
  if (!dataset) return [];
  const coverage = firstObserved(dataset.coverage, dataset.date_range, dataset.temporal_coverage);
  const companies = firstObserved(
    dataset.company_count,
    dataset.issuer_count,
    dataset.entity_count,
    dataset.entities_count,
  );
  const grain = firstObserved(dataset.grain, dataset.unit_of_observation, dataset.frequency);
  const updated = firstObserved(dataset.updated_at, dataset.as_of, dataset.last_updated);
  const source = firstObserved(dataset.source, dataset.publisher, dataset.source_system);

  return [
    coverage ? { label: "Coverage", value: String(coverage) } : null,
    companies != null ? { label: "Companies", value: String(companies) } : null,
    grain ? { label: "Grain", value: String(grain).replace(/_/g, " ") } : null,
    source ? { label: "Source", value: String(source) } : null,
    updated ? { label: "Updated", value: shortDate(updated) } : null,
  ]
    .filter(Boolean)
    .slice(0, 4);
}

function FocalAssetCard({ dataset, loading, onOpenLibrary, onInspect }) {
  if (loading) {
    return (
      <section className="rd-v2-home-authority-card focal" aria-label="Featured Library evidence">
        <span className="rd-v2-home-authority-eyebrow">Continue from Library</span>
        <Skeleton lines={4} label="Loading featured evidence" />
      </section>
    );
  }

  if (!dataset) {
    return (
      <section className="rd-v2-home-authority-card focal" aria-label="Featured Library evidence">
        <span className="rd-v2-home-authority-eyebrow">Continue from Library</span>
        <h2>Your evidence estate is ready</h2>
        <p>Open Library to choose the durable evidence object you want to continue from.</p>
        <div className="rd-v2-home-authority-actions">
          <button type="button" className="rd-v2-btn sm primary" onClick={onOpenLibrary}>
            Open Library
          </button>
        </div>
      </section>
    );
  }

  const facts = focalFacts(dataset);
  return (
    <section
      className="rd-v2-home-authority-card focal"
      aria-label={`Featured Library evidence: ${displayName(dataset)}`}
      data-testid="home-focal-asset"
    >
      <div className="rd-v2-home-focal-head">
        <div>
          <span className="rd-v2-home-authority-eyebrow">Continue from Library</span>
          <h2>{displayName(dataset)}</h2>
        </div>
        <span className="rd-v2-home-authority-state">{statusPill(dataset)}</span>
      </div>
      <p className="rd-v2-home-focal-summary">{assetSummary(dataset)}</p>
      {facts.length ? (
        <dl className="rd-v2-home-focal-facts">
          {facts.map((fact) => (
            <div key={`${fact.label}-${fact.value}`}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="rd-v2-home-focal-rule" aria-hidden>
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="rd-v2-home-authority-actions">
        <button type="button" className="rd-v2-btn sm primary" onClick={() => onOpenLibrary?.(dataset)}>
          Open in Library
        </button>
        {onInspect ? (
          <button type="button" className="rd-v2-btn sm" onClick={() => onInspect(dataset)}>
            Inspect schema
          </button>
        ) : null}
      </div>
    </section>
  );
}

function ContinueResearchCard({ point, loading, secondary, onContinue, onReview }) {
  if (loading) {
    return (
      <section
        className="rd-v2-home-authority-card continue"
        data-testid="home-continue"
        aria-label="Continue research"
        aria-busy="true"
      >
        <span className="rd-v2-home-authority-eyebrow">Pick up · Continue research</span>
        <Skeleton lines={4} label="Loading resume point" />
      </section>
    );
  }

  if (!point) {
    return (
      <section className="rd-v2-home-authority-card continue" data-testid="home-continue" aria-label="Continue research">
        <span className="rd-v2-home-authority-eyebrow">Pick up · Continue research</span>
        <h2>Start from durable evidence</h2>
        <p>No existing research object currently needs resumption.</p>
        <button type="button" className="rd-v2-btn sm primary" onClick={() => onContinue?.({ tab: "library" })}>
          Continue
        </button>
      </section>
    );
  }

  return (
    <section
      className={`rd-v2-home-authority-card continue${point.warn ? " warn" : ""}`}
      data-testid="home-continue"
      data-kind={point.kind}
      data-resume-id={point.id || ""}
      aria-label={`Continue research: ${point.title}`}
    >
      <span className="rd-v2-home-authority-eyebrow">Pick up · Continue research</span>
      <h2>{point.title}</h2>
      <p>{point.stateSummary}</p>
      <div className="rd-v2-home-continue-meta">
        {point.pill ? <span className="rd-v2-pill">{point.pill}</span> : null}
        <span>{point.location}</span>
      </div>
      <div className="rd-v2-home-authority-actions">
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
      {secondary ? (
        <button
          type="button"
          className="rd-v2-home-continue-secondary"
          onClick={() => (secondary.action === "review" ? onReview?.(secondary) : onContinue?.(secondary))}
        >
          <span>Also active</span>
          <strong>{secondary.title}</strong>
          <em>{secondary.action === "review" ? "Review →" : "Continue →"}</em>
        </button>
      ) : null}
    </section>
  );
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

  useEffect(() => {
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
    () =>
      buildPickUp({
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

  const headroom = useMemo(() => buildResourceHeadroom(headroomRollup, health), [headroomRollup, health]);
  const recommended = useMemo(() => buildRecommendedEvidence(profile, { limit: 3 }), [profile]);
  const trail = useMemo(() => buildRecentTrail({ jobs, datasets, limit: 4 }), [jobs, datasets]);
  const focalAsset = useMemo(() => selectFocalAsset(datasets, pickUp), [datasets, pickUp]);

  const continuePrimary = (point) => {
    if (point?.thread?.id) {
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

  const openFocalInLibrary = (dataset = focalAsset) => {
    if (dataset) onSelectDataset?.(dataset);
    onGoTab?.("library");
  };

  const researcher = researcherName(profile);
  const greeting = researcher ? `Welcome back, ${researcher}` : "Welcome back";

  return (
    <PageShell className="rd-v2-home-page rd-v2-home-authority" title="Home" lead="" footer={null} surfaceState={surfaceState}>
      <header className="rd-v2-home-authority-welcome">
        <div>
          <span className="rd-v2-home-authority-kicker">Research workspace</span>
          <h1>{greeting}</h1>
          <p>Resume durable work, check your research headroom, and move the next evidence decision forward.</p>
        </div>
        <button type="button" className="rd-v2-btn primary rd-v2-home-new-research" onClick={() => onGoTab?.("synthesis")}>
          + New research
        </button>
      </header>

      {loadError ? <DeskError raw={loadError} surface="Home's Library briefing" /> : null}

      <div className="rd-v2-home-authority-primary">
        <FocalAssetCard dataset={focalAsset} loading={loading} onOpenLibrary={openFocalInLibrary} onInspect={onPreviewDataset} />

        <section className="rd-v2-home-authority-card headroom" aria-label="Resource headroom">
          <div className="rd-v2-home-authority-card-head">
            <div>
              <span className="rd-v2-home-authority-eyebrow">Resource headroom</span>
              <h2>Capacity for the next move</h2>
            </div>
          </div>
          {loading || headroomLoading ? (
            <Skeleton lines={4} label="Loading headroom" />
          ) : headroom.length ? (
            <ul className="rd-v2-home-authority-headroom-list">
              {headroom.slice(0, 3).map((slot) => (
                <li key={slot.id} className={slot.warn ? "warn" : undefined}>
                  <div className="rd-v2-home-authority-headroom-row">
                    <strong>
                      {slot.markId ? <HomeHeadroomMark markId={slot.markId} /> : null}
                      {slot.name}
                    </strong>
                    <span>{slot.metric}</span>
                  </div>
                  <HeadroomBar pct={slot.pct} warn={slot.warn} />
                  <small>{slot.headroom}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rd-v2-home-authority-muted">Capacity signals load with Resources.</p>
          )}
          <button type="button" className="rd-v2-linkish rd-v2-home-manage-resources" onClick={() => onGoTab?.("resources")}>
            Manage resources →
          </button>
        </section>

        <ContinueResearchCard
          point={pickUp.primary}
          secondary={pickUp.secondary}
          loading={loading}
          onContinue={continuePrimary}
          onReview={reviewDecision}
        />
      </div>

      <div className="rd-v2-home-authority-secondary">
        <section className="rd-v2-home-authority-card trail" aria-label="Recent trail">
          <div className="rd-v2-home-authority-section-head">
            <div>
              <span className="rd-v2-home-authority-eyebrow">Recent trail</span>
              <h2>Durable consequences</h2>
            </div>
            <button type="button" className="rd-v2-linkish" onClick={() => onGoTab?.("browse")}>
              View History →
            </button>
          </div>
          {trail.length ? (
            <ul className="rd-v2-home-authority-trail-list">
              {trail.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="rd-v2-home-authority-trail-row"
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
                    <span className="kind">{item.kind}</span>
                    <strong>{item.title}</strong>
                    <span className="summary">{item.summary}</span>
                    <em>{item.dest === "library" ? "Library →" : "History →"}</em>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rd-v2-home-section-empty-actions">
              <p className="rd-v2-home-section-empty">Nothing durable yet — recent work will collect here.</p>
            </div>
          )}
        </section>

        <section className="rd-v2-home-authority-card next" aria-label="Suggested next steps">
          <div className="rd-v2-home-authority-section-head">
            <div>
              <span className="rd-v2-home-authority-eyebrow">Suggested next steps</span>
              <h2>Move the research forward</h2>
            </div>
          </div>
          {recommended.length ? (
            <ul className="rd-v2-home-authority-next-list">
              {recommended.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
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
                    <em>{item.action === "library" ? "Library →" : "Discover →"}</em>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <HomeSuggestedAsks profile={profile} onAskComposer={onAskComposer || onSuggestSearch} canLoadPrincipalSeed={canUseAsk} />
          )}
        </section>
      </div>
    </PageShell>
  );
}
