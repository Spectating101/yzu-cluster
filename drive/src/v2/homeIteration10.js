/**
 * Home Iteration 10 projection helpers — docs/HOME_FULL_SCALE_FREEZE_2026-07-16.md
 */

import { displayName, isReceiptOnlyAsset, statusPill } from "./datasetMeta.js";
import { buildHomeBriefing } from "./homeBriefing.js";
import { buildLab } from "./profileViewModel.js";
import { recentDatasets } from "./recent.js";
import { isHistoryNoise, isSystemVerificationTraffic } from "./historyNoiseFence.js";
import { synthesisJourneyStage } from "./synthesisLifecycle.js";
import {
  assistantProviderRead,
  assistantRuntimeDetail,
  composerRuntimeRead,
} from "./composerRuntimeStatus.js";

function purposeLine(ds) {
  return (
    ds?.summary ||
    ds?.description ||
    ds?.purpose ||
    [ds?.source, ds?.coverage, ds?.grain].filter(Boolean).join(" · ") ||
    "Research dataset in the Library"
  );
}

function folderLabel(value) {
  if (value == null || value === "") return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object") {
    return (
      value.path ||
      value.name ||
      value.label ||
      value.folder ||
      value.id ||
      value.dataset_id ||
      ""
    );
  }
  return "";
}

function folderLocation(ds) {
  const folder = folderLabel(
    ds?.library_folder || ds?.folder || ds?.collection || ds?.estate_folder || "",
  );
  if (folder) return `LIBRARY / ${String(folder).replace(/_/g, " ").toUpperCase()}`;
  return "LIBRARY";
}

function formatHeadroom(pct) {
  if (!Number.isFinite(pct)) return "Capacity on file";
  return `${Math.max(0, Math.round(100 - pct))}% headroom`;
}

export function buildPickUp({
  datasets = [],
  jobs = [],
  health,
  acquisitions = [],
  profile,
  synthesisThreads = [],
  pendingDecisionCount = null,
} = {}) {
  const briefing = buildHomeBriefing({ datasets, jobs, acquisitions, health, profile });
  const holdings = (datasets || []).filter((ds) => !isReceiptOnlyAsset(ds));
  const recent = recentDatasets(holdings, 2);
  const primaryDs = recent[0] || holdings[0] || datasets[0] || null;
  const secondaryDs =
    recent[1] ||
    (primaryDs && holdings.find((ds) => ds?.dataset_id && ds.dataset_id !== primaryDs.dataset_id)) ||
    null;

  const candidates = [];
  const pendingJobs = (jobs || []).filter((job) =>
    /pending|approval|hold/i.test(String(job?.status || job?.state || "")),
  );
  const judgmentApprovals = (briefing?.needsJudgment || []).filter((item) => item.kind === "approval");
  // Home and the header must describe the same researcher-visible decision
  // queue. The raw jobs feed includes fenced operator/fixture work; App passes
  // its lifecycle-filtered count when it has one. Keep the local derivation as
  // a fallback for standalone/unit use.
  const derivedPendingCount = Number(
    judgmentApprovals.length || health?.desk?.jobs?.pending_approval || pendingJobs.length || 0,
  );
  const pendingCount = pendingDecisionCount != null && Number.isFinite(Number(pendingDecisionCount))
    ? Math.max(0, Number(pendingDecisionCount))
    : derivedPendingCount;
  const firstPending =
    (judgmentApprovals[0]?.job && pendingJobs.find((job) => job.id === judgmentApprovals[0].job.id)) ||
    judgmentApprovals[0]?.job ||
    pendingJobs[0] ||
    null;

  if (pendingCount > 0) {
    const rawTitle = String(
      firstPending?.plan?.title || firstPending?.title || firstPending?.name || "",
    ).trim();
    candidates.push({
      rank: 0,
      updated: String(firstPending?.updated_at || firstPending?.created_at || ""),
      point: {
        kind: "decision",
        id: firstPending?.id || "approval",
        title: /^synth(?:esis)?[\s_-]*block$/i.test(rawTitle)
          ? "Synthesis proposal awaiting review"
          : rawTitle || "Research decision waiting",
        stateSummary: "A researcher decision is required before this work can continue.",
        location: "DISCOVER / HISTORY",
        // This is the Home attention queue, not the header's job-only count.
        // Name the scope so two truthful counts do not look contradictory.
        pill: `${pendingCount} awaiting review`,
        job: firstPending,
        tab: "browse",
        action: "review",
        warn: true,
      },
    });
  }

  const stageRank = {
    approval: 2,
    proposal: 3,
    preview: 4,
    specification: 5,
    evidence: 6,
    build: 7,
    objective: 8,
  };
  const stageLabel = {
    approval: "Approval",
    proposal: "Proposal review",
    preview: "Bounded preview",
    specification: "Specification",
    evidence: "Evidence",
    build: "Build",
    objective: "Objective",
  };

  for (const thread of synthesisThreads || []) {
    if (!thread?.id) continue;
    const status = String(thread?.state?.execution?.status || "").toLowerCase().replace(/-/g, "_");
    const stage = synthesisJourneyStage(thread);
    if (["registered", "query_ready"].includes(status) || stage === "result") continue;
    const failed = status === "failed";
    const summary = failed
      ? "Execution failed; inspect the durable construction before retrying."
      : stage === "approval"
        ? "A bounded preview has reached the execution-approval boundary."
        : stage === "proposal"
          ? "An exact Synthesis proposal is ready for researcher review."
          : stage === "preview"
            ? "The accepted method is at bounded-preview validation."
            : stage === "specification"
              ? "Held evidence is mapped; material construction choices remain."
              : stage === "evidence"
                ? "This durable construction is waiting on evidence decisions."
                : stage === "build"
                  ? `Execution is ${status || "in progress"}; inspect its durable build and registration state.`
                  : "A durable Synthesis construction is ready to continue.";
    candidates.push({
      rank: failed ? 1 : (stageRank[stage] ?? 8),
      updated: String(thread.updated_at || thread.created_at || ""),
      point: {
        kind: "synthesis_thread",
        id: thread.id,
        title: String(thread.title || thread?.state?.title || thread?.state?.objective || thread.objective || "Synthesis construction"),
        stateSummary: summary,
        location: `SYNTHESIS / ${(stageLabel[stage] || stage || "THREAD").toUpperCase()}`,
        pill: failed ? "Needs recovery" : stageLabel[stage] || "Active",
        thread,
        tab: "synthesis",
        action: "continue",
        warn: failed || stage === "approval",
      },
    });
  }

  for (const job of jobs || []) {
    const status = String(job?.status || job?.state || "").toLowerCase();
    if (!/failed|queued|running/.test(status)) continue;
    if (isHistoryNoise({ id: job.id, title: job?.plan?.title || job.title, status })) continue;
    const failed = status === "failed";
    candidates.push({
      rank: failed ? 9 : 10,
      updated: String(job.updated_at || job.created_at || ""),
      point: {
        kind: "discover_work",
        id: job.id || `discover-${status}`,
        title: String(job?.plan?.title || job.title || job.name || "Discover acquisition"),
        stateSummary: failed
          ? "Acquisition failed; inspect the durable History record before retrying."
          : `Acquisition is ${status}; History holds the durable lifecycle record.`,
        location: "DISCOVER / HISTORY",
        pill: failed ? "Needs recovery" : status,
        job,
        tab: "browse",
        action: "review",
        warn: failed,
      },
    });
  }

  const libraryPoint = (ds, rank) => ds ? {
    rank,
    updated: String(ds.updated_at || ds.created_at || ""),
    point: {
      kind: "library_asset",
      id: ds.dataset_id,
      title: displayName(ds),
      stateSummary: purposeLine(ds),
      location: folderLocation(ds),
      pill: statusPill(ds),
      dataset: ds,
      tab: "library",
      action: "continue",
    },
  } : null;
  const firstLibrary = libraryPoint(primaryDs, 20);
  const secondLibrary = libraryPoint(secondaryDs, 21);
  if (firstLibrary) candidates.push(firstLibrary);
  if (secondLibrary) candidates.push(secondLibrary);

  candidates.sort((left, right) => {
    if (left.rank !== right.rank) return left.rank - right.rank;
    return String(right.updated).localeCompare(String(left.updated));
  });

  return {
    primary: candidates[0]?.point || null,
    secondary: candidates[1]?.point || null,
    pending: pendingCount,
  };
}

function headroomPct(used, cap) {
  const u = Number(used);
  const c = Number(cap);
  if (!Number.isFinite(u) || !Number.isFinite(c) || c <= 0) return null;
  return Math.round((u / c) * 100);
}

/**
 * Project a thin rollup from /health so Home headroom can paint before
 * GET /library/desk/resources finishes (Terra cache-first pattern).
 */
export function projectRollupFromHealth(health) {
  if (!health || typeof health !== "object") return null;
  const desk = health.desk || {};
  const tiers = desk.storage_tiers || {};
  const canonical = tiers.canonical || desk.archive || {};
  const cache = tiers.cache || desk.bulk_storage || {};
  const hasVault = canonical.label || canonical.quota_tb != null || canonical.used_tb != null;
  const hasCache =
    cache.label || cache.mounted != null || cache.used_gb != null || cache.total_gb != null;
  if (!hasVault && !hasCache && desk.composer_configured == null) return null;
  return {
    usage: {
      vault: hasVault
        ? {
            label: canonical.label || "Google Drive vault",
            used_tb: canonical.used_tb,
            cap_tb: canonical.quota_tb ?? canonical.pool_tb,
            pct: canonical.pct,
            observed: canonical.used_tb != null,
          }
        : undefined,
      cache: hasCache
        ? {
            label: cache.label || "Transcend bulk cache",
            mounted: cache.mounted,
            used_gb: cache.used_gb ?? cache.used_gib,
            total_gb: cache.total_gb ?? cache.total_gib,
            pct: cache.pct ?? cache.used_pct,
          }
        : undefined,
    },
    hero: {
      composer: {
        configured: Boolean(desk.composer_configured),
        model: String(desk.composer_model || "").trim(),
        provider: String(desk.brain || "").trim(),
        runtime: desk.composer_runtime || null,
      },
      vault:
        canonical.used_tb != null || canonical.quota_tb != null
          ? {
              used_tb: canonical.used_tb,
              cap_tb: canonical.quota_tb ?? canonical.pool_tb,
              pct: canonical.pct,
            }
          : undefined,
    },
    ai: {
      composer_configured: Boolean(desk.composer_configured),
      composer_model: String(desk.composer_model || "").trim(),
      composer_provider: String(desk.brain || "").trim(),
      composer_runtime: desk.composer_runtime || null,
    },
  };
}

/**
 * Home Resource headroom — aligned with Resources Capacity showcase.
 * Prefer vault + bulk cache + one live service (Cursor Ask / BigQuery).
 * NVMe / collectors stay on Resources Desk, not the Home teaser.
 */
export function buildResourceHeadroom(rollup, health = null) {
  const usage = rollup?.usage || {};
  const hero = rollup?.hero || {};
  const ai = rollup?.ai || {};
  const metered = rollup?.metered || {};
  const slots = [];

  const vault = usage.vault || hero.vault || {};
  if (vault.used_tb != null || vault.cap_tb != null) {
    const usedRaw = vault.used_tb;
    const capRaw = vault.cap_tb;
    const used =
      usedRaw === null || usedRaw === undefined || usedRaw === ""
        ? null
        : Number(usedRaw);
    const cap =
      capRaw === null || capRaw === undefined || capRaw === "" ? null : Number(capRaw);
    const usedOk = Number.isFinite(used);
    const capOk = Number.isFinite(cap);
    const observed = vault.observed !== false && usedOk;
    const pct = observed
      ? vault.pct != null
        ? Number(vault.pct)
        : headroomPct(used, cap)
      : null;
    slots.push({
      id: "vault",
      markId: "vault",
      name: vault.label || "Google Drive vault",
      pinned: true,
      metric: observed
        ? used === 0 && capOk
          ? `Empty · ${cap} TB capacity`
          : `${used}/${capOk ? cap : "?"} TB`
        : capOk
          ? `${cap} TB capacity · use not observed`
          : "Quota not observed",
      pct: Number.isFinite(pct) ? Math.round(pct) : null,
      headroom: observed ? formatHeadroom(pct) : "NOT OBSERVED",
      warn: pct != null && pct >= 75,
      action: "resources",
    });
  }

  const cache = usage.cache || {};
  if (cache.used_gb != null || cache.total_gb != null || cache.mounted) {
    const pct = cache.pct != null ? Number(cache.pct) : headroomPct(cache.used_gb, cache.total_gb);
    slots.push({
      id: "cache",
      markId: "cache",
      name: cache.label || "Transcend bulk cache",
      pinned: false,
      metric:
        cache.used_gb != null || cache.total_gb != null
          ? `${cache.used_gb ?? "?"}/${cache.total_gb ?? "?"} GB`
          : cache.mounted
            ? "Mounted"
            : "Capacity",
      pct: Number.isFinite(pct) ? Math.round(pct) : null,
      headroom: Number.isFinite(pct) ? formatHeadroom(pct) : cache.mounted ? "Ready" : "—",
      warn: pct != null && pct >= 85,
      action: "resources",
    });
  }

  // Third teaser: the currently selected research assistant when live, else
  // BigQuery quota. Provider identity comes from /health.desk.brain; never
  // leave a retired provider name hard-coded on Home.
  const composer = hero.composer || {};
  const liveDesk = health?.desk || {};
  const composerOk = Boolean(
    liveDesk.composer_configured ?? composer.configured ?? ai.composer_configured,
  );
  const turnsToday = Number(ai.composer_turns_today ?? 0);
  const bq = metered.bigquery || {};
  if (composerOk) {
    // A configured key is not a live probe. Settings and Resources render
    // composer_runtime; Home must read the same field or it claims readiness
    // the desk has not observed.
    const runtime = composerRuntimeRead(
      liveDesk.composer_runtime ?? composer.runtime ?? ai.composer_runtime,
    );
    const provider = assistantProviderRead({
      brain: liveDesk.brain || composer.provider || ai.composer_provider,
    });
    const providerDesk = {
      brain: liveDesk.brain || composer.provider || ai.composer_provider,
      composer_model:
        liveDesk.composer_model || composer.model || ai.composer_model,
    };
    slots.push({
      id: "cursor",
      markId: provider.id === "cursor" ? "cursor" : "assistant",
      name: provider.label,
      pinned: false,
      metric: turnsToday > 0 ? `${turnsToday} turns today` : (runtime?.short ?? "Not yet probed"),
      pct: null,
      headroom: runtime
        ? assistantRuntimeDetail(
            providerDesk,
            runtime,
          )
        : `${provider.runtimeLabel} · runtime not verified`,
      warn: runtime ? Boolean(runtime.warn) : true,
      action: "resources",
    });
  } else if (bq.configured) {
    const bqCap =
      bq.default_max_gib != null
        ? Number(bq.default_max_gib)
        : bq.default_max_bytes_billed != null
          ? Number(bq.default_max_bytes_billed) / 1024 ** 3
          : null;
    const bqToday = Number(bq.gib_billed_today ?? 0);
    const pct = Number.isFinite(bqCap) && bqCap > 0 ? headroomPct(bqToday, bqCap) : null;
    slots.push({
      id: "bigquery",
      markId: "bigquery",
      name: "BigQuery",
      pinned: false,
      metric: [bq.project || "ADC ok", Number.isFinite(bqCap) ? `${bqCap} GiB / query` : null]
        .filter(Boolean)
        .join(" · "),
      pct: Number.isFinite(pct) ? Math.round(pct) : null,
      headroom: Number.isFinite(bqToday) ? `${bqToday} GiB billed today` : "Configured",
      warn: false,
      action: "resources",
    });
  }

  return slots.slice(0, 3);
}

export function buildRecommendedEvidence(profile, { limit = 2 } = {}) {
  const lab = buildLab(profile);
  return (lab.suggested || []).slice(0, limit).map((item) => ({
    id: item.id,
    title: item.label,
    reason: item.reason || "recommended for current research",
    badge: item.action === "link" ? "IN LIBRARY, NOT LINKED" : "NOT IN LIBRARY YET",
    query: item.query,
    datasetId: item.datasetId,
    action: item.action === "link" ? "library" : "explore",
  }));
}

export function buildRecentTrail({ jobs = [], datasets = [], limit = 3 } = {}) {
  const material = [...jobs]
    .filter((job) => {
      const status = String(job.status || "");
      // Home trail is resume surface — keep cancelled out of the first viewport.
      if (/cancelled|canceled/i.test(status)) return false;
      if (!/completed|registered|failed|running|queued/i.test(status)) return false;
      const event = {
        id: job.id,
        target: job?.plan?.title || job?.title || job?.name || job?.dataset_id,
        title: job?.plan?.title || job?.title || job?.name,
        summary: job.error || job.result?.summary || status,
        status,
        error: job.error,
        meta: { summary: job.error || job.result?.summary, status },
      };
      return !isHistoryNoise(event) && !isSystemVerificationTraffic(event);
    })
    .sort((a, b) => {
      const rank = (job) => {
        const s = String(job.status || "").toLowerCase();
        if (/registered|completed/.test(s)) return 0;
        if (/running|queued/.test(s)) return 1;
        if (/failed/.test(s)) return 2;
        return 3;
      };
      const byRank = rank(a) - rank(b);
      if (byRank !== 0) return byRank;
      return String(b.updated_at || b.created_at || "").localeCompare(
        String(a.updated_at || a.created_at || ""),
      );
    });

  const seen = new Set();
  const fromJobs = [];
  for (const job of material) {
    const status = String(job.status || "").toLowerCase();
    let kind = "PROCUREMENT";
    if (/registered|completed/.test(status)) kind = "COLLECTION COMPLETED";
    else if (/failed/.test(status)) kind = "COLLECTION FAILED";
    else if (/running|queued/.test(status)) kind = "REFRESH ADVANCED";
    const title =
      job?.plan?.title ||
      job?.title ||
      job?.name ||
      job?.dataset_id ||
      "Collection job";
    const key = `${kind}|${String(title).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    fromJobs.push({
      id: job.id,
      kind,
      title,
      summary: String(job.error || job.result?.summary || status).replace(/_/g, " "),
      dest: /registered|completed/.test(status) ? "library" : "history",
    });
    if (fromJobs.length >= limit) break;
  }

  if (fromJobs.length) return fromJobs;

  return recentDatasets(datasets, limit).map((ds) => ({
    id: ds.dataset_id,
    kind: "REGISTERED ASSET",
    title: displayName(ds),
    summary: statusPill(ds),
    dest: "library",
    dataset: ds,
  }));
}
