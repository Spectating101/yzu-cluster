/** Merge config/desk_sources.json with live desk telemetry (providers, not datasets). */

import manifest from "../../config/desk_sources.json";

function row(ok = true, warn = false, extra = {}) {
  return { ok, warn, ...extra };
}

export function buildLayerRows({ health, queryUp = true } = {}) {
  const engineUp = queryUp && (health?.status === "ok" || health?.status === "demo");
  const composerOk = !!health?.desk?.composer_configured;

  return (manifest.layers || []).map((layer) => {
    let ok = true;
    let warn = false;
    if (layer.id === "registry_catalog") ok = engineUp;
    if (layer.id === "web_discover" || layer.id === "probe_url") warn = !composerOk;

    return row(ok, warn, {
      kind: "layer",
      key: `layer-${layer.id}`,
      section: "Layers",
      label: layer.label,
      metric: layer.route,
      detail: layer.detail,
    });
  });
}

export function buildProviderRows({ health, ops, catalogSummary } = {}) {
  const desk = health?.desk || {};
  const dh = ops?.datacite_harvest;

  return (manifest.sources || [])
    .filter((src) => src.show_on_resources === true)
    .map((src) => {
    let ok = true;
    let warn = false;

    if (src.id === "gdrive_vault") {
      ok = desk.gdrive?.ok !== false;
      warn = desk.gdrive?.warn;
    }
    if (src.id === "datacite") {
      ok = dh?.ok !== false && dh?.status !== "warn" && dh?.status !== "degraded";
      warn = dh?.warn || dh?.status === "warn" || dh?.status === "degraded";
    }
    if (src.id === "bigquery") {
      warn = !desk.legacy_llm_configured && !desk.composer_configured;
    }
    if (src.id === "coingecko") ok = true;

    const queueNote =
      catalogSummary?.queue_tasks != null
        ? `${catalogSummary.runnable_queue_tasks ?? 0}/${catalogSummary.queue_tasks} queue tasks`
        : null;

    return row(ok, warn, {
      kind: "source",
      key: `source-${src.id}`,
      section: "Sources",
      label: src.label,
      endpoint: src.endpoint,
      layers: (src.layers || []).join(" · "),
      routes: src.routes,
      collect_via: (src.collect_via || []).join(", "),
      metric: src.routes,
      detail: queueNote,
      manifest: src,
    });
  });
}

