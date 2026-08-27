from pathlib import Path


def replace_once(path, old, new, label):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match in {path}, found {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


# This script runs after discover_adversarial_hardening.py and
# discover_visual_compression.py. Preserve the distinction between a successful
# full /desk/resources measurement and the thinner /health projection App may
# retain when the full resource refresh fails.
replace_once(
    "drive/src/v2/App.jsx",
    '''          catalog={catalog}\n          resourcesRollup={resourcesRollup}\n          deskHealth={health}\n          selectedId={browseSelectedId}\n''',
    '''          catalog={catalog}\n          resourcesRollup={resourcesRollup}\n          resourcesError={resourcesError}\n          deskHealth={health}\n          selectedId={browseSelectedId}\n''',
    "App passes resource refresh authority",
)

replace_once(
    "drive/src/v2/BrowsePage.jsx",
    '''  resourcesRollup,\n  deskHealth = null,\n''',
    '''  resourcesRollup,\n  resourcesError = "",\n  deskHealth = null,\n''',
    "BrowsePage accepts resource refresh authority",
)
replace_once(
    "drive/src/v2/BrowsePage.jsx",
    '''                  resourcesRollup={resourcesRollup}\n                  deskHealth={deskHealth}\n''',
    '''                  resourcesRollup={resourcesRollup}\n                  resourcesError={resourcesError}\n                  deskHealth={deskHealth}\n''',
    "BrowsePage passes resource refresh authority",
)

replace_once(
    "drive/src/v2/DiscoverEvidenceBrief.jsx",
    '''  resourcesRollup,\n  deskHealth = null,\n''',
    '''  resourcesRollup,\n  resourcesError = "",\n  deskHealth = null,\n''',
    "EvidenceBrief accepts resource refresh authority",
)

replace_once(
    "drive/src/v2/DiscoverEvidenceBrief.jsx",
    '''  const capacityRows = useMemo(\n    () => buildDiscoverDecisionCapacity(resourcesRollup, deskHealth, { routes: routeRows }),\n    [resourcesRollup, deskHealth, routeResult],\n  );\n  const capacityState = resourcesRollup === undefined\n    ? "checking"\n    : resourcesRollup === null\n      ? "unavailable"\n      : capacityRows.length\n        ? "measured"\n        : "unreported";\n''',
    '''  const capacityRows = useMemo(\n    () => buildDiscoverDecisionCapacity(resourcesRollup, deskHealth, { routes: routeRows }),\n    [resourcesRollup, deskHealth, routeResult],\n  );\n  const resourcesRefreshFailed = Boolean(String(resourcesError || "").trim());\n  // A failed /desk/resources read may still leave a thin /health projection in\n  // App. Only surface rows whose underlying fields are actually present in that\n  // surviving rollup; never turn omitted fleet/BigQuery telemetry into a false\n  // "not configured" or generic availability claim.\n  const partialCapacityRows = useMemo(() => {\n    if (!resourcesRefreshFailed || !resourcesRollup || typeof resourcesRollup !== "object") return [];\n    const usage = resourcesRollup.usage || {};\n    const hero = resourcesRollup.hero || {};\n    const metered = resourcesRollup.metered || {};\n    const workers = hero.workers || {};\n    const hasWorkers = [workers.available, workers.online, workers.idle, workers.ready, workers.total, workers.joined]\n      .some((value) => value !== undefined && value !== null && value !== "");\n    return capacityRows.filter((row) => {\n      if (row.id === "vault") return Boolean(usage.vault || hero.vault);\n      if (row.id === "cache") return Boolean(usage.cache);\n      if (row.id === "bigquery") return Boolean(metered.bigquery);\n      if (row.id === "fleet") return hasWorkers;\n      return false;\n    });\n  }, [capacityRows, resourcesRefreshFailed, resourcesRollup]);\n  const visibleCapacityRows = resourcesRefreshFailed ? partialCapacityRows : capacityRows;\n  const capacityState = resourcesRollup === undefined\n    ? "checking"\n    : resourcesRefreshFailed\n      ? (visibleCapacityRows.length ? "partial" : "unavailable")\n      : resourcesRollup === null\n        ? "unavailable"\n        : visibleCapacityRows.length\n          ? "measured"\n          : "unreported";\n''',
    "capacity distinguishes full and degraded measurement",
)

replace_once(
    "drive/src/v2/DiscoverEvidenceBrief.jsx",
    '''              {capacityState === "checking" ? (\n                <p className="muted" role="status">Checking measured desk capacity…</p>\n              ) : capacityState === "unavailable" ? (\n                <p className="muted">Measured capacity is unavailable. Do not assume compute, storage, or quota from this sourcing view.</p>\n              ) : capacityRows.length ? (\n                <div className="rd-v2-evidence-capacity-grid">\n                  {capacityRows.map((row) => (\n                    <div key={row.id} className={row.attention ? "needs-attention" : ""}>\n                      <span>{row.label}</span><strong>{row.metric}</strong>{row.detail ? <em>{row.detail}</em> : null}\n                    </div>\n                  ))}\n                </div>\n              ) : (\n''',
    '''              {capacityState === "checking" ? (\n                <p className="muted" role="status">Checking measured desk capacity…</p>\n              ) : capacityState === "partial" ? (\n                <>\n                  <p className="muted">Full resource refresh failed. Showing only capacity facts still measured by the desk; do not infer missing compute, storage, or quota.</p>\n                  <div className="rd-v2-evidence-capacity-grid">\n                    {visibleCapacityRows.map((row) => (\n                      <div key={row.id} className={row.attention ? "needs-attention" : ""}>\n                        <span>{row.label}</span><strong>{row.metric}</strong>{row.detail ? <em>{row.detail}</em> : null}\n                      </div>\n                    ))}\n                  </div>\n                </>\n              ) : capacityState === "unavailable" ? (\n                <p className="muted">Measured capacity is unavailable. Do not assume compute, storage, or quota from this sourcing view.</p>\n              ) : visibleCapacityRows.length ? (\n                <div className="rd-v2-evidence-capacity-grid">\n                  {visibleCapacityRows.map((row) => (\n                    <div key={row.id} className={row.attention ? "needs-attention" : ""}>\n                      <span>{row.label}</span><strong>{row.metric}</strong>{row.detail ? <em>{row.detail}</em> : null}\n                    </div>\n                  ))}\n                </div>\n              ) : (\n''',
    "capacity surface explains degraded measurement",
)

print("Applied Discover capacity authority: checking, measured, partial, unavailable")
