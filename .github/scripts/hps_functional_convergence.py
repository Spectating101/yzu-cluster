from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def replace_once(path, old, new):
    p = ROOT / path
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:100]!r}")
    p.write_text(text.replace(old, new, 1))


# ---------------------------------------------------------------------------
# Home continuity projection: decisions > recovery/reviewable Synthesis >
# active Synthesis > Discover lifecycle work > recent Library evidence.
# ---------------------------------------------------------------------------
replace_once(
    "drive/src/v2/homeIteration10.js",
    'import { isHistoryNoise, isSystemVerificationTraffic } from "./historyNoiseFence.js";\n',
    'import { isHistoryNoise, isSystemVerificationTraffic } from "./historyNoiseFence.js";\nimport { synthesisJourneyStage } from "./synthesisLifecycle.js";\n',
)

p = ROOT / "drive/src/v2/homeIteration10.js"
text = p.read_text()
start = text.index("export function buildPickUp(")
end = text.index("\nfunction headroomPct", start)
new_pickup = r'''export function buildPickUp({
  datasets = [],
  jobs = [],
  health,
  acquisitions = [],
  profile,
  synthesisThreads = [],
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
  const pendingCount = Number(
    judgmentApprovals.length || health?.desk?.jobs?.pending_approval || pendingJobs.length || 0,
  );
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
        pill: `${pendingCount} pending`,
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
'''
p.write_text(text[:start] + new_pickup + text[end:])

# Home attention should preserve the actual kind rather than relabel every
# Discover lifecycle item as an approval.
replace_once(
    "drive/src/v2/HomePage.jsx",
    '        kind: "approval",\n        tab: "browse",',
    '        kind: point.kind || "attention",\n        tab: "browse",',
)

# ---------------------------------------------------------------------------
# App-level policy consumers and exact Home/Synthesis continuity.
# ---------------------------------------------------------------------------
replace_once(
    "drive/src/v2/App.jsx",
    '  listLibraryNav,\n  openQueryInNewTab,',
    '  listLibraryNav,\n  openQueryInNewTab,',
)
replace_once(
    "drive/src/v2/App.jsx",
    'import { loadSettings } from "@/v2/settingsStore";',
    'import {\n  discoverScopeIsWide,\n  loadSettings,\n  rememberResearchSurface,\n  selectionRailTab,\n  startupTab,\n} from "@/v2/settingsStore";',
)
replace_once(
    "drive/src/v2/App.jsx",
    '  const rawTab = p.get("tab") || (dataset ? "library" : "") || loadSettings().defaultTab || "home";',
    '  const rawTab = p.get("tab") || (dataset ? "library" : "") || startupTab() || "home";',
)
replace_once(
    "drive/src/v2/App.jsx",
    '  const [discoverPreferLive, setDiscoverPreferLive] = useState(false);',
    '  const [discoverPreferLive, setDiscoverPreferLive] = useState(() => discoverScopeIsWide());',
)

# Remember only actual research workspaces. The store itself rejects shell pages.
anchor = '''  const [tab, setTabRaw] = useState(() => canonicalTab(readParams().tab));
  const setTab = useCallback((next) => {
    setTabRaw((prev) => canonicalTab(typeof next === "function" ? next(prev) : next));
  }, []);
'''
replacement = anchor + '''  useEffect(() => {
    rememberResearchSurface(tab);
  }, [tab]);
'''
replace_once("drive/src/v2/App.jsx", anchor, replacement)

old_go = '''  const goTab = useCallback(
    (id, opts = {}) => {
      const next = normalizeReleaseTab(canonicalTab(id));
      if (next === "library") {
        setTab(next);
        setRailTab("detail");
'''
new_go = '''  const goTab = useCallback(
    (id, opts = {}) => {
      const next = normalizeReleaseTab(canonicalTab(id));
      if (next === DISCOVER_TAB && !opts.preserveDiscoverScope) {
        setDiscoverPreferLive(discoverScopeIsWide());
      }
      if (next === "library") {
        setTab(next);
        setRailTab("detail");
'''
replace_once("drive/src/v2/App.jsx", old_go, new_go)

replace_once(
    "drive/src/v2/App.jsx",
    '      setDiscoverSearchQuery(String(field.label || field.dataset_id || "").trim());\n      goTab("browse");',
    '      setDiscoverSearchQuery(String(field.label || field.dataset_id || "").trim());\n      // Synthesis evidence gaps always begin with held/known evidence before federation.\n      setDiscoverPreferLive(false);\n      goTab("browse", { preserveDiscoverScope: true });',
)

replace_once(
    "drive/src/v2/App.jsx",
    '      setRailTab(loadSettings().onSelect === "ask" ? "ask" : "detail");\n      syncUrl({ dataset: id, preview: false });',
    '      setRailTab((current) => selectionRailTab(current));\n      syncUrl({ dataset: id, preview: false });',
)
replace_once(
    "drive/src/v2/App.jsx",
    '      setRailTab(loadSettings().onSelect === "ask" ? "ask" : "detail");\n      syncUrl({ tab: "library", dataset: id, preview: false });',
    '      setRailTab((current) => selectionRailTab(current));\n      syncUrl({ tab: "library", dataset: id, preview: false });',
)

# Explicit widen/Ask actions own their chosen scope and should not be overwritten
# by the global ordinary-navigation preference.
replace_once(
    "drive/src/v2/App.jsx",
    '      goTab("browse");\n      syncUrl({ tab: "browse", q });\n    },\n    [discoverSearchQuery, goTab, syncUrl],\n  );',
    '      goTab("browse", { preserveDiscoverScope: true });\n      syncUrl({ tab: "browse", q });\n    },\n    [discoverSearchQuery, goTab, syncUrl],\n  );',
)
# askDiscoverQuery has an additional rail write after syncUrl, so use a narrower anchor.
replace_once(
    "drive/src/v2/App.jsx",
    '      goTab("browse");\n      syncUrl({ tab: "browse", q });\n      setRailTab("ask");',
    '      goTab("browse", { preserveDiscoverScope: true });\n      syncUrl({ tab: "browse", q });\n      setRailTab("ask");',
)

# Home inspector binding now handles non-Library continuity objects truthfully.
old_activate = '''      const row = point?.dataset;
      const id = row?.dataset_id || row?.id || "";
      if (!id) {
        setSelectedId((current) => (current ? "" : current));
        setDetail((current) => (current ? null : current));
        setActiveObject((current) => (current ? null : current));
        writeParams({ tab: "home", dataset: "", folder: "", preview: false, q: "", mode: "" });
        return;
      }
'''
new_activate = '''      const row = point?.dataset;
      const id = row?.dataset_id || row?.id || "";
      if (!id) {
        setSelectedId((current) => (current ? "" : current));
        setDetail((current) => (current ? null : current));
        setActiveObject(point ? homeAttentionObject(point) : null);
        writeParams({ tab: "home", dataset: "", folder: "", preview: false, q: "", mode: "" });
        return;
      }
'''
replace_once("drive/src/v2/App.jsx", old_activate, new_activate)

# Home exact Synthesis continuation.
replace_once(
    "drive/src/v2/App.jsx",
    '          onPrimaryResume={activateHomeResume}\n          onAskAttention={askHomeAttention}',
    '          onPrimaryResume={activateHomeResume}\n          onResumeSynthesisThread={(thread) => {\n            if (!thread?.id) return;\n            setFocusSynthesisThreadId(thread.id);\n            setActiveObject(synthesisThreadObject(thread));\n            goTab("synthesis");\n          }}\n          onAskAttention={askHomeAttention}',
)

# Ordinary Home suggestions obey the chosen Discover policy.
replace_once(
    "drive/src/v2/App.jsx",
    '          onSuggestSearch={(q) => {\n            setDiscoverPreferLive(false);\n            setDiscoverSearchQuery(q);\n            goTab("browse");\n          }}',
    '          onSuggestSearch={(q) => {\n            setDiscoverSearchQuery(q);\n            goTab("browse");\n          }}',
)

# Evidence selection in Discover obeys the same evidence-selection policy as Library.
replace_once(
    "drive/src/v2/App.jsx",
    '            setActiveObject(externalCandidateObject(stamped));\n            setRailTab("detail");',
    '            setActiveObject(externalCandidateObject(stamped));\n            setRailTab((current) => selectionRailTab(current));',
)

# Profile is a researcher record; it receives Library possession authority and
# no longer owns a broken routing callback.
old_profile = '''        <ProfilePage
          profile={profile}
          onGoTab={goTab}
          onProfileRefresh={reloadProfile}
          onSuggestSearch={(q) => {
            setSearchQuery(q);
            setTab("browse");
            syncUrl({ tab: "browse", q });
          }}
        />'''
new_profile = '''        <ProfilePage
          profile={profile}
          libraryHoldings={heldLibraryRows}
          onGoTab={goTab}
          onProfileRefresh={reloadProfile}
        />'''
replace_once("drive/src/v2/App.jsx", old_profile, new_profile)

replace_once(
    "drive/src/v2/App.jsx",
    '          onProfileRefresh={reloadProfile}\n          onToast={showToast}\n        />',
    '          onProfileRefresh={reloadProfile}\n          onToast={showToast}\n          onSettingsChange={(next, change) => {\n            if (Object.prototype.hasOwnProperty.call(change || {}, "discoverScope")) {\n              setDiscoverPreferLive(next.discoverScope === "wide");\n            }\n          }}\n        />',
)

# ---------------------------------------------------------------------------
# Right-rail copy must describe actual authority, not nonexistent credentials or
# personalization contracts.
# ---------------------------------------------------------------------------
old_profile_rail = '''  profile: {
    title: "Profile context",
    desc: "Faculty profile controls ranking, procurement hints, and research-area context.",
    fields: [
      ["Used for", "Discover ranking"],
      ["Also affects", "Procurement chat"],
      ["Next", "Update email in Settings"],
    ],
  },
  settings: {
    title: "Desk setup",
    desc: "Credentials and display preferences for the research drive.",
    fields: [
      ["Account", "Faculty email"],
      ["Credentials", "BQ, GDrive, DataCite"],
      ["Display", "Default tab and rail mode"],
    ],
  },'''
new_profile_rail = '''  profile: {
    title: "Researcher record",
    desc: "Registry-backed identity, research context, works, and recorded evidence relationships.",
    fields: [
      ["Source", "Faculty registry"],
      ["Evidence authority", "Library confirms what is actually held"],
      ["Boundary", "Suggestions are not researcher facts"],
    ],
  },
  settings: {
    title: "Workspace policy",
    desc: "Behavior, identity binding, and browser access for this Research Drive.",
    fields: [
      ["Behavior", "Startup, evidence Inspector, Discover breadth"],
      ["Identity", "Faculty email binding"],
      ["System status", "Available under technical details"],
    ],
  },'''
replace_once("drive/src/v2/RailPanels.jsx", old_profile_rail, new_profile_rail)

print("HPS functional convergence patch applied")
