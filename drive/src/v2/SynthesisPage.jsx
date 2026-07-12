import { useEffect, useMemo, useRef, useState } from "react";
import {
  getSynthesisProfile,
  listSynthesisProfiles,
  runSynthesis,
  runSynthesisPair,
} from "@/v2/api";
import { displayName, statusPill } from "@/v2/datasetMeta";
import { PageShell } from "@/v2/ui";

const FALLBACK_PROFILES = [
  {
    profile_id: "stablecoin_trust_engagement",
    title: "Stablecoin trust & engagement",
    type: "Research panel",
    objective:
      "Combine security, on-chain activity, and public attention into one weekly research panel.",
    inputs: [
      {
        dataset_id: "skynet_stablecoin_security",
        name: "Stablecoin security & governance",
        source: "CertiK Skynet",
        grain: "asset-week",
        coverage: "2021–2026",
        join_keys: ["asset_id", "week"],
        analysis_readiness: "instant",
      },
      {
        dataset_id: "etherscan_stablecoin_activity",
        name: "Stablecoin on-chain activity",
        source: "Etherscan",
        grain: "asset-day",
        coverage: "2021–2026",
        join_keys: ["asset_id", "date"],
        analysis_readiness: "instant",
      },
      {
        dataset_id: "stablecoin_attention_overlay",
        name: "Public attention overlay",
        source: "GDELT · Wikipedia · GitHub",
        grain: "asset-week",
        coverage: "2021–2026",
        join_keys: ["asset_id", "week"],
        analysis_readiness: "instant",
      },
    ],
    output: {
      dataset_id: "stablecoin_trust_weekly_panel",
      name: "Stablecoin trust weekly panel",
      grain: "asset-week",
      coverage: "2021–2026",
      destination: "Research panels",
    },
  },
  {
    profile_id: "skynet_etherscan_stablecoin",
    title: "Security × on-chain activity",
    type: "Two-source synthesis",
    objective: "Join governance and security signals to observed on-chain activity.",
    inputs: [
      {
        dataset_id: "skynet_stablecoin_security",
        name: "Stablecoin security & governance",
        source: "CertiK Skynet",
        grain: "asset-week",
        coverage: "2021–2026",
        join_keys: ["asset_id", "week"],
        analysis_readiness: "instant",
      },
      {
        dataset_id: "etherscan_stablecoin_activity",
        name: "Stablecoin on-chain activity",
        source: "Etherscan",
        grain: "asset-day",
        coverage: "2021–2026",
        join_keys: ["asset_id", "date"],
        analysis_readiness: "instant",
      },
    ],
    output: {
      dataset_id: "skynet_etherscan_stablecoin_panel",
      name: "Security and activity panel",
      grain: "asset-week",
      coverage: "2021–2026",
      destination: "Synthesis outputs",
    },
  },
  {
    profile_id: "jkse_pit_idn_microstructure_revisions",
    title: "JKSE point-in-time revisions",
    type: "Point-in-time panel",
    objective:
      "Assemble Indonesian market, estimates, and point-in-time accounting evidence without look-ahead leakage.",
    inputs: [
      {
        dataset_id: "jkse_point_in_time",
        name: "JKSE point-in-time fundamentals",
        source: "Refinitiv",
        grain: "security-date",
        coverage: "2010–2026",
        join_keys: ["ric", "date"],
        analysis_readiness: "instant",
      },
      {
        dataset_id: "idn_estimate_revisions",
        name: "Indonesia estimate revisions",
        source: "Refinitiv estimates",
        grain: "security-date",
        coverage: "2017–2026",
        join_keys: ["ric", "date"],
        analysis_readiness: "instant",
      },
      {
        dataset_id: "idn_market_spine",
        name: "Indonesia market spine",
        source: "In-house panel",
        grain: "security-date",
        coverage: "2010–2026",
        join_keys: ["ric", "date"],
        analysis_readiness: "instant",
      },
    ],
    output: {
      dataset_id: "jkse_pit_revision_panel",
      name: "JKSE PIT revision panel",
      grain: "security-date",
      coverage: "2010–2026",
      destination: "Research panels",
    },
  },
];

function humanize(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  return [];
}

function normalizeInput(value, datasets) {
  const spec = typeof value === "string" ? { dataset_id: value } : value || {};
  const id = spec.dataset_id || spec.id || spec.registry_id || spec.name || spec.title;
  const catalogRow = datasets.find((row) => row.dataset_id === id) || null;
  return {
    ...catalogRow,
    ...spec,
    dataset_id: id || catalogRow?.dataset_id || "",
    name:
      spec.name ||
      spec.title ||
      catalogRow?.name ||
      catalogRow?.title ||
      humanize(id) ||
      "Research asset",
    source:
      spec.source ||
      spec.publisher ||
      spec.source_system ||
      catalogRow?.source ||
      catalogRow?.source_system ||
      "Lab registry",
    grain: spec.grain || catalogRow?.grain || "Grain not described",
    coverage:
      spec.coverage ||
      spec.date_range ||
      spec.temporal_coverage ||
      catalogRow?.coverage ||
      catalogRow?.date_range ||
      "Coverage not described",
    join_keys: asArray(spec.join_keys || spec.keys || catalogRow?.join_keys),
    analysis_readiness:
      spec.analysis_readiness || spec.readiness || catalogRow?.analysis_readiness || "unknown",
  };
}

function sourceList(profile) {
  return (
    profile?.inputs ||
    profile?.sources ||
    profile?.datasets ||
    profile?.peer_sources ||
    profile?.peers ||
    profile?.source_datasets ||
    []
  );
}

function outputSpec(profile) {
  const raw = profile?.output || profile?.result || profile?.target || {};
  const id =
    raw.dataset_id ||
    raw.id ||
    profile?.output_dataset_id ||
    profile?.target_dataset_id ||
    profile?.profile_id ||
    "synthesis_output";
  return {
    ...raw,
    dataset_id: id,
    name: raw.name || raw.title || profile?.output_name || humanize(id),
    grain: raw.grain || profile?.output_grain || "Derived research grain",
    coverage: raw.coverage || profile?.coverage || "Computed from input overlap",
    destination:
      raw.destination ||
      raw.output_area ||
      raw.path ||
      profile?.output_area ||
      profile?.output_path ||
      "Synthesis outputs",
  };
}

function normalizeProfile(raw, datasets) {
  const id = raw?.profile_id || raw?.id || raw?.key || raw?.name || "synthesis-profile";
  const inputs = asArray(sourceList(raw)).map((item) => normalizeInput(item, datasets));
  return {
    ...raw,
    profile_id: id,
    title: raw?.title || raw?.label || raw?.name || humanize(id),
    type: raw?.type || raw?.profile_type || raw?.kind || "Synthesis blueprint",
    objective:
      raw?.objective ||
      raw?.description ||
      raw?.summary ||
      "Combine selected lab assets into a reusable research output.",
    inputs,
    output: outputSpec(raw),
  };
}

function normalizeProfileList(payload, datasets) {
  const rows = Array.isArray(payload)
    ? payload
    : payload?.profiles || payload?.items || payload?.results || [];
  return asArray(rows).map((row) => normalizeProfile(row, datasets)).filter((row) => row.profile_id);
}

function parseYears(value) {
  const years = String(value || "").match(/(?:19|20)\d{2}/g) || [];
  if (!years.length) return null;
  return { start: Number(years[0]), end: Number(years[years.length - 1]) };
}

function intersectCoverage(inputs) {
  const spans = inputs.map((input) => parseYears(input.coverage)).filter(Boolean);
  if (!spans.length) return "Unknown";
  const start = Math.max(...spans.map((span) => span.start));
  const end = Math.min(...spans.map((span) => span.end));
  return start <= end ? `${start}–${end}` : "No confirmed overlap";
}

function sharedKeys(inputs) {
  const sets = inputs
    .map((input) => new Set(asArray(input.join_keys).map((key) => String(key).toLowerCase())))
    .filter((set) => set.size);
  if (!sets.length) return [];
  return [...sets[0]].filter((key) => sets.every((set) => set.has(key)));
}

function compatibilityFor(inputs) {
  const valid = inputs.filter(Boolean);
  const keys = sharedKeys(valid);
  const grains = [...new Set(valid.map((input) => String(input.grain || "").toLowerCase()).filter(Boolean))];
  const readyCount = valid.filter((input) => /instant|query|connected/i.test(String(input.analysis_readiness || ""))).length;
  const time = intersectCoverage(valid);
  const exactGrain = grains.length === 1;
  const knownCoverage = time !== "Unknown" && time !== "No confirmed overlap";
  return {
    key: keys.length ? keys.join(" · ") : "Key mapping required",
    keyTone: keys.length ? "ok" : "warn",
    grain: exactGrain ? "Aligned" : grains.length ? "Transform required" : "Unknown",
    grainDetail: exactGrain ? valid[0]?.grain : grains.join(" → ") || "No grain metadata",
    grainTone: exactGrain ? "ok" : grains.length ? "warn" : "unknown",
    time,
    timeTone: knownCoverage ? "ok" : time === "No confirmed overlap" ? "warn" : "unknown",
    readiness: `${readyCount}/${valid.length || 0} ready`,
    readinessTone: valid.length && readyCount === valid.length ? "ok" : readyCount ? "warn" : "unknown",
    overall:
      keys.length && knownCoverage
        ? exactGrain
          ? "Ready to run"
          : "Ready with one transformation"
        : "Review required",
    overallTone: keys.length && knownCoverage ? (exactGrain ? "ok" : "warn") : "warn",
    transformations: exactGrain ? [] : grains.length ? ["Normalize input grain"] : [],
  };
}

function resultOutput(result, fallback) {
  const raw = result?.output || result?.dataset || result?.registered_dataset || result?.result || {};
  const datasetId =
    result?.registered_dataset_id ||
    result?.output_dataset_id ||
    raw?.dataset_id ||
    raw?.id ||
    fallback?.dataset_id;
  return {
    ...fallback,
    ...raw,
    dataset_id: datasetId,
    name: raw?.name || raw?.title || result?.output_name || fallback?.name,
    grain: raw?.grain || result?.grain || fallback?.grain,
    coverage: raw?.coverage || result?.coverage || fallback?.coverage,
    destination:
      raw?.destination || raw?.path || result?.output_path || fallback?.destination,
    row_count: result?.row_count ?? result?.rows ?? raw?.row_count ?? raw?.rows ?? null,
    registered: Boolean(result?.registered_dataset_id || raw?.registered || result?.registered),
  };
}

function AssetMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <ellipse cx="12" cy="5" rx="7" ry="3" />
      <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
      <path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </svg>
  );
}

function BlueprintMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="7" r="2.5" />
      <circle cx="5" cy="17" r="2.5" />
      <circle cx="19" cy="12" r="2.5" />
      <path d="M7.5 7.8 16.5 11M7.5 16.2 16.5 13" />
    </svg>
  );
}

function InputCard({ input, index, editable, datasets, onChange }) {
  return (
    <article className="rd-syn-input-card" data-testid="synthesis-input-card">
      <div className="rd-syn-input-icon"><AssetMark /></div>
      <div className="rd-syn-input-main">
        <div className="rd-syn-input-order">Input {String(index + 1).padStart(2, "0")}</div>
        {editable ? (
          <select
            aria-label={`Synthesis input ${index + 1}`}
            value={input?.dataset_id || ""}
            onChange={(event) => onChange?.(event.target.value)}
          >
            <option value="">Choose a Library asset</option>
            {datasets.map((dataset) => (
              <option key={dataset.dataset_id} value={dataset.dataset_id}>
                {displayName(dataset)}
              </option>
            ))}
          </select>
        ) : (
          <strong>{input?.name || "Research asset"}</strong>
        )}
        <span>{input?.source || "Lab registry"}</span>
      </div>
      <div className="rd-syn-input-meta">
        <span>{input?.grain || "Grain unknown"}</span>
        <span>{input?.coverage || "Coverage unknown"}</span>
        <em>{statusPill(input)}</em>
      </div>
    </article>
  );
}

function CompatibilityMetric({ label, value, detail, tone = "unknown" }) {
  return (
    <div className={`rd-syn-compat-metric is-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

export function SynthesisPage({
  datasets = [],
  compareIds = [],
  onCompareChange,
  onAskComposer,
  onGoTab,
  onOpenDataset,
}) {
  const fallbackProfiles = useMemo(
    () => FALLBACK_PROFILES.map((profile) => normalizeProfile(profile, datasets)),
    [datasets],
  );
  const [profiles, setProfiles] = useState(fallbackProfiles);
  const [profileSource, setProfileSource] = useState("loading");
  const [selectedProfileId, setSelectedProfileId] = useState(
    fallbackProfiles[0]?.profile_id || "custom_pair",
  );
  const [profileDetail, setProfileDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [runState, setRunState] = useState({ status: "idle", result: null, error: "" });
  const outputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setProfiles(fallbackProfiles);
    listSynthesisProfiles()
      .then((payload) => {
        if (cancelled) return;
        const live = normalizeProfileList(payload, datasets);
        if (!live.length) {
          setProfileSource("fallback");
          return;
        }
        setProfiles(live);
        setProfileSource("live");
        setSelectedProfileId((current) =>
          live.some((profile) => profile.profile_id === current)
            ? current
            : live[0].profile_id,
        );
      })
      .catch(() => {
        if (!cancelled) setProfileSource("fallback");
      });
    return () => {
      cancelled = true;
    };
  }, [datasets, fallbackProfiles]);

  const baseProfile = profiles.find((profile) => profile.profile_id === selectedProfileId) || profiles[0] || null;

  useEffect(() => {
    if (customMode || !baseProfile?.profile_id || profileSource !== "live") {
      setProfileDetail(null);
      setDetailLoading(false);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    getSynthesisProfile(baseProfile.profile_id)
      .then((payload) => {
        if (cancelled) return;
        const raw = payload?.profile || payload?.item || payload;
        setProfileDetail(normalizeProfile({ ...baseProfile, ...raw }, datasets));
      })
      .catch(() => {
        if (!cancelled) setProfileDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [baseProfile?.profile_id, customMode, datasets, profileSource]);

  const activeProfile = useMemo(() => {
    if (customMode) {
      const chosen = compareIds
        .slice(0, 2)
        .map((id) => datasets.find((dataset) => dataset.dataset_id === id))
        .filter(Boolean)
        .map((dataset) => normalizeInput(dataset, datasets));
      return {
        profile_id: "custom_pair",
        title: "Custom synthesis",
        type: "Library pair",
        objective: "Choose two owned assets, review compatibility, and build a reusable output.",
        inputs: chosen,
        output: {
          dataset_id: chosen.length === 2 ? `${chosen[0].dataset_id}_${chosen[1].dataset_id}_synthesis` : "custom_synthesis_output",
          name:
            chosen.length === 2
              ? `${chosen[0].name} × ${chosen[1].name}`
              : "Custom synthesis output",
          grain: chosen[0]?.grain || "Derived research grain",
          coverage: intersectCoverage(chosen),
          destination: "Synthesis outputs",
        },
      };
    }
    return profileDetail || baseProfile;
  }, [baseProfile, compareIds, customMode, datasets, profileDetail]);

  const inputs = useMemo(
    () => asArray(activeProfile?.inputs).map((input) => normalizeInput(input, datasets)),
    [activeProfile, datasets],
  );
  const compatibility = useMemo(() => compatibilityFor(inputs), [inputs]);
  const plannedOutput = useMemo(() => outputSpec(activeProfile || {}), [activeProfile]);
  const producedOutput = runState.result ? resultOutput(runState.result, plannedOutput) : plannedOutput;
  const runEnabled = inputs.length >= 2 && inputs.every((input) => input.dataset_id);

  const selectProfile = (profileId) => {
    setCustomMode(false);
    setSelectedProfileId(profileId);
    setRunState({ status: "idle", result: null, error: "" });
  };

  const selectCustom = () => {
    setCustomMode(true);
    setProfileDetail(null);
    setRunState({ status: "idle", result: null, error: "" });
    if (!compareIds[0] || !compareIds[1]) {
      const ids = datasets.slice(0, 2).map((dataset) => dataset.dataset_id);
      if (ids.length === 2) onCompareChange?.(ids);
    }
  };

  const updateCustomInput = (index, id) => {
    const next = [...compareIds];
    next[index] = id;
    onCompareChange?.(next);
    setRunState({ status: "idle", result: null, error: "" });
  };

  const askCompatibility = () => {
    const inputNames = inputs.map((input) => `${input.name} (${input.grain})`).join("; ");
    onAskComposer?.(
      `Review this synthesis plan: ${activeProfile?.title || "Custom synthesis"}. Inputs: ${inputNames}. ` +
        `Common join path: ${compatibility.key}. Grain: ${compatibility.grainDetail}. ` +
        `Time overlap: ${compatibility.time}. Explain remaining risks, required transformations, and whether the output is safe to build.`,
    );
  };

  const execute = async () => {
    if (!runEnabled || runState.status === "running") return;
    setRunState({ status: "running", result: null, error: "" });
    try {
      const result = customMode
        ? await runSynthesisPair(inputs[0].dataset_id, inputs[1].dataset_id)
        : await runSynthesis(activeProfile.profile_id);
      setRunState({ status: "success", result, error: "" });
      window.requestAnimationFrame(() => {
        if (window.matchMedia?.("(max-width: 720px)").matches) {
          outputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    } catch (error) {
      setRunState({
        status: "error",
        result: null,
        error: error?.message || "Synthesis could not run. Check the desk connection and profile inputs.",
      });
    }
  };

  const outputState =
    runState.status === "running"
      ? "Building output"
      : runState.status === "success"
        ? producedOutput.registered
          ? "Registered in Library"
          : "Output created"
        : "Planned output";

  return (
    <PageShell
      className="rd-v2-synthesis-page"
      title="Synthesis"
      lead="Combine owned research assets into a reusable output."
    >
      <div className="rd-syn-studio" data-testid="synthesis-studio">
        <aside className="rd-syn-blueprints" aria-label="Synthesis blueprints">
          <div className="rd-syn-blueprints-head">
            <span>Blueprints</span>
            <small>{profileSource === "live" ? `${profiles.length} available` : "Desk recipes"}</small>
          </div>
          <div className="rd-syn-blueprint-list" role="tablist" aria-label="Synthesis blueprint list">
            {profiles.map((profile) => (
              <button
                key={profile.profile_id}
                type="button"
                role="tab"
                aria-selected={!customMode && selectedProfileId === profile.profile_id}
                className={!customMode && selectedProfileId === profile.profile_id ? "is-active" : ""}
                onClick={() => selectProfile(profile.profile_id)}
              >
                <span className="rd-syn-blueprint-icon"><BlueprintMark /></span>
                <span className="rd-syn-blueprint-copy">
                  <strong>{profile.title}</strong>
                  <small>{profile.type} · {profile.inputs?.length || "—"} inputs</small>
                </span>
                <span className="rd-syn-blueprint-arrow">›</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`rd-syn-custom-blueprint${customMode ? " is-active" : ""}`}
            onClick={selectCustom}
          >
            <span>＋</span>
            <strong>Custom pair</strong>
            <small>Choose from Library</small>
          </button>
          <div className="rd-syn-blueprints-foot">
            <span className={`rd-syn-source-dot is-${profileSource}`} />
            {profileSource === "live"
              ? "Live synthesis registry"
              : profileSource === "loading"
                ? "Loading registry"
                : "Previewing documented recipes"}
          </div>
        </aside>

        <section className="rd-syn-workspace" aria-label="Synthesis workspace">
          <header className="rd-syn-workspace-head">
            <div>
              <span className="rd-syn-kicker">Synthesis studio</span>
              <h2>{activeProfile?.title || "Choose a blueprint"}</h2>
              <p>{activeProfile?.objective}</p>
            </div>
            <div className="rd-syn-workspace-state">
              <span className={`rd-syn-status is-${compatibility.overallTone}`}>
                <i /> {detailLoading ? "Reading blueprint" : compatibility.overall}
              </span>
              <button type="button" className="rd-v2-btn sm" onClick={askCompatibility}>
                Ask
              </button>
            </div>
          </header>

          <div className="rd-syn-assembly">
            <section className="rd-syn-inputs" aria-labelledby="rd-syn-inputs-title">
              <div className="rd-syn-section-head">
                <span id="rd-syn-inputs-title">Owned inputs</span>
                <small>{inputs.length} selected</small>
              </div>
              <div className="rd-syn-input-stack">
                {inputs.slice(0, 3).map((input, index) => (
                  <InputCard
                    key={`${input.dataset_id}-${index}`}
                    input={input}
                    index={index}
                    editable={customMode}
                    datasets={datasets}
                    onChange={(id) => updateCustomInput(index, id)}
                  />
                ))}
                {customMode && inputs.length < 2
                  ? [0, 1].slice(inputs.length).map((offset) => (
                      <InputCard
                        key={`empty-${offset}`}
                        input={null}
                        index={inputs.length + offset}
                        editable
                        datasets={datasets}
                        onChange={(id) => updateCustomInput(inputs.length + offset, id)}
                      />
                    ))
                  : null}
                {inputs.length > 3 ? (
                  <div className="rd-syn-more-inputs">+{inputs.length - 3} additional sources in this blueprint</div>
                ) : null}
              </div>
            </section>

            <section className="rd-syn-compat" aria-labelledby="rd-syn-compat-title">
              <div className="rd-syn-compat-node" aria-hidden="true">
                <span />
                <strong>S</strong>
                <span />
              </div>
              <div className="rd-syn-section-head">
                <span id="rd-syn-compat-title">Compatibility</span>
                <small>Registry-derived</small>
              </div>
              <div className="rd-syn-compat-summary">
                <strong>{compatibility.overall}</strong>
                <span>
                  {compatibility.transformations.length
                    ? compatibility.transformations.join(" · ")
                    : "No structural transformation identified"}
                </span>
              </div>
              <div className="rd-syn-compat-grid">
                <CompatibilityMetric
                  label="Join path"
                  value={compatibility.key}
                  tone={compatibility.keyTone}
                />
                <CompatibilityMetric
                  label="Grain"
                  value={compatibility.grain}
                  detail={compatibility.grainDetail}
                  tone={compatibility.grainTone}
                />
                <CompatibilityMetric
                  label="Time overlap"
                  value={compatibility.time}
                  tone={compatibility.timeTone}
                />
                <CompatibilityMetric
                  label="Readiness"
                  value={compatibility.readiness}
                  tone={compatibility.readinessTone}
                />
              </div>
            </section>

            <section ref={outputRef} className="rd-syn-output" aria-labelledby="rd-syn-output-title">
              <div className="rd-syn-section-head">
                <span id="rd-syn-output-title">Research output</span>
                <small>{outputState}</small>
              </div>
              <article className={`rd-syn-output-card is-${runState.status}`} data-testid="synthesis-output-card">
                <div className="rd-syn-output-orbit" aria-hidden="true"><span /><span /><span /></div>
                <span className="rd-syn-output-label">{outputState}</span>
                <h3>{producedOutput.name}</h3>
                <p>{producedOutput.dataset_id}</p>
                <dl>
                  <div><dt>Grain</dt><dd>{producedOutput.grain}</dd></div>
                  <div><dt>Coverage</dt><dd>{producedOutput.coverage}</dd></div>
                  <div><dt>Destination</dt><dd>{producedOutput.destination}</dd></div>
                  {producedOutput.row_count != null ? (
                    <div><dt>Rows</dt><dd>{Number(producedOutput.row_count).toLocaleString()}</dd></div>
                  ) : null}
                </dl>
                {runState.status === "success" ? (
                  <div className="rd-syn-output-complete">
                    <span>✓</span>
                    <strong>
                      {producedOutput.registered
                        ? "Reusable asset registered"
                        : "Output produced; registration not confirmed"}
                    </strong>
                  </div>
                ) : null}
              </article>
            </section>
          </div>

          {runState.status === "error" ? (
            <div className="rd-syn-message is-error" role="alert">
              <strong>Synthesis did not run.</strong>
              <span>{runState.error}</span>
            </div>
          ) : null}

          <footer className="rd-syn-actionbar">
            <div className="rd-syn-plan-summary">
              <span>{inputs.length} inputs</span>
              <span>{compatibility.transformations.length || 0} transformations</span>
              <span>{producedOutput.destination}</span>
            </div>
            <div className="rd-syn-actions">
              {runState.status === "success" ? (
                producedOutput.registered ? (
                  <button
                    type="button"
                    className="rd-v2-btn sm"
                    onClick={() => onOpenDataset?.(producedOutput)}
                  >
                    Open in Library
                  </button>
                ) : (
                  <button type="button" className="rd-v2-btn sm" onClick={askCompatibility}>
                    Ask to register
                  </button>
                )
              ) : (
                <button type="button" className="rd-v2-btn sm" onClick={() => onGoTab?.("library")}>
                  Open Library
                </button>
              )}
              <button
                type="button"
                className="rd-v2-btn sm primary rd-syn-run"
                disabled={!runEnabled || runState.status === "running"}
                onClick={execute}
              >
                {runState.status === "running"
                  ? "Building…"
                  : runState.status === "success"
                    ? "Run again"
                    : "Run synthesis"}
              </button>
            </div>
          </footer>
        </section>
      </div>
    </PageShell>
  );
}
