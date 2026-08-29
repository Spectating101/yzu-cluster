import { useEffect, useMemo, useState } from "react";
import { fetchJson } from "@/v2/api";
import { homeSuggestedPrompts } from "@/v2/homePrompts";
import { Chip, ChipRow } from "@/v2/ui";

function seedLead(seed, profile) {
  if (seed?.bootstrap_mode === "faculty_profile") return "Research desk seeded from your faculty profile";
  if (seed?.bootstrap_mode === "yzu_profile_fallback") return "Research desk ready — start with a question or add evidence";
  if (seed?.bootstrap_mode === "generic_cold_start") return "Research desk ready — start with a question or add evidence";
  if (profile && !profile.unknown) return "Suggested for your research profile";
  return "Suggested asks — start with a question or add evidence";
}

export function HomeSuggestedAsks({ profile, onAskComposer }) {
  const [seed, setSeed] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchJson("/library/seed", { timeoutMs: 8000 })
      .then((payload) => {
        if (!cancelled && payload && typeof payload === "object") setSeed(payload);
      })
      .catch(() => {
        // Seed is an enrichment contract, not a Home availability dependency.
        // Older/staged backends may not expose it yet; existing profile prompts
        // remain the truthful fallback in that case.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const profilePrompts = useMemo(() => homeSuggestedPrompts(profile, { limit: 4 }), [profile]);
  const prompts = useMemo(() => {
    const seeded = Array.isArray(seed?.starter_prompts)
      ? seed.starter_prompts.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
    return (seeded.length ? seeded : profilePrompts).slice(0, 4);
  }, [profilePrompts, seed]);

  const connectedSources = Array.isArray(seed?.connected_sources) ? seed.connected_sources : [];
  const sourceSummary = seed?.source_summary && typeof seed.source_summary === "object" ? seed.source_summary : null;
  const lead = seedLead(seed, profile);

  return (
    <section
      className="rd-v2-home-suggested"
      aria-label="Suggested asks"
      data-testid="home-research-seed"
      data-bootstrap-mode={seed?.bootstrap_mode || "fallback"}
    >
      <p className="muted small rd-v2-home-suggested-lead">{lead}</p>
      {seed ? (
        <p className="muted small" data-testid="home-research-seed-sources">
          {connectedSources.length
            ? `${connectedSources.length} verified connected ${connectedSources.length === 1 ? "source" : "sources"} · additive to your base research context`
            : "No connected storage required · your base research context is available"}
          {sourceSummary?.reference_holdings
            ? ` · ${sourceSummary.reference_holdings} reference ${sourceSummary.reference_holdings === 1 ? "holding" : "holdings"}`
            : ""}
        </p>
      ) : null}
      {connectedSources.length ? (
        <p className="muted small" data-testid="home-research-seed-connected-labels">
          {connectedSources.map((source) => source?.label || source?.provider || "Connected storage").join(" · ")}
        </p>
      ) : null}
      <ChipRow>
        {prompts.map((prompt) => (
          <Chip key={prompt} active onClick={() => onAskComposer?.(prompt)}>
            {prompt.length > 72 ? `${prompt.slice(0, 69)}…` : prompt}
          </Chip>
        ))}
      </ChipRow>
    </section>
  );
}
