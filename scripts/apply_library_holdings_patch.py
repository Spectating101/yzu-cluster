from pathlib import Path


def replace_once(path, old, new, label):
    p = Path(path)
    text = p.read_text()
    if new and new in text:
        return
    if not new and old not in text:
        return
    if old not in text:
        raise SystemExit(f"{label} anchor missing in {path}")
    p.write_text(text.replace(old, new, 1))


workspace = "drive/src/v2/LibraryAssetWorkspace.jsx"
replace_once(
    workspace,
    'import { libraryVerification } from "@/v2/libraryVerification";\nimport { PageShell } from "@/v2/ui";',
    'import { libraryVerification } from "@/v2/libraryVerification";\nimport { LibraryHoldingsOverlay } from "@/v2/LibraryHoldingsOverlay";\nimport { summarizeLibraryHoldings } from "@/v2/libraryHoldings";\nimport { PageShell } from "@/v2/ui";',
    "workspace holdings imports",
)
replace_once(
    workspace,
    "Bibliographic and holding metadata for {displayName(dataset)}.",
    "Bibliographic and access metadata for {displayName(dataset)}.",
    "scholarly holding wording",
)
replace_once(
    workspace,
    "Reproducibility receipt for this Library asset. Provider identity, source location, acquisition method, verification, and use readiness remain separate claims.",
    "Origin and reproducibility receipt for this Library asset. Source authority, acquisition route, verification, and use readiness remain separate claims from current storage holdings.",
    "source receipt boundary",
)
replace_once(
    workspace,
    '                <div><dt>Vault path</dt><dd><code>{fields.vault || "Not declared"}</code></dd></div>\n',
    "",
    "remove storage path from provenance",
)
replace_once(
    workspace,
    '  const verification = useMemo(() => libraryVerification(dataset), [dataset]);\n  const canQuery = state.kind === "query-ready";',
    '  const verification = useMemo(() => libraryVerification(dataset), [dataset]);\n  const holdings = useMemo(() => summarizeLibraryHoldings(dataset), [dataset]);\n  const canQuery = state.kind === "query-ready";',
    "workspace holdings summary",
)
replace_once(
    workspace,
    '          <button type="button" className="rd-v2-btn" onClick={() => setOverlay("provenance")}>Source record</button>\n          {!canQuery && state.kind === "registered" && onPrepare ? (',
    '          <button type="button" className="rd-v2-btn" onClick={() => setOverlay("provenance")}>Source record</button>\n          {holdings.count ? <button type="button" className="rd-v2-btn" onClick={() => setOverlay("holdings")}>Holdings</button> : null}\n          {!canQuery && state.kind === "registered" && onPrepare ? (',
    "workspace holdings action",
)
replace_once(
    workspace,
    '      <AssetOverlay\n        kind={overlay}\n        dataset={dataset}\n        fields={fields}\n        presentation={presentation}\n        onClose={() => setOverlay("")}\n      />\n    </PageShell>',
    '      <AssetOverlay\n        kind={overlay === "holdings" ? "" : overlay}\n        dataset={dataset}\n        fields={fields}\n        presentation={presentation}\n        onClose={() => setOverlay("")}\n      />\n      <LibraryHoldingsOverlay\n        open={overlay === "holdings"}\n        dataset={dataset}\n        onClose={() => setOverlay("")}\n      />\n    </PageShell>',
    "workspace holdings overlay",
)

rail = "drive/src/v2/LibraryDatasetRailPanel.jsx"
replace_once(
    rail,
    'import { libraryVerification } from "@/v2/libraryVerification";\nimport { RailFrame, RailStickyFooter } from "@/v2/RailFrame";',
    'import { libraryVerification } from "@/v2/libraryVerification";\nimport { holdingRoleLabel, summarizeLibraryHoldings } from "@/v2/libraryHoldings";\nimport { RailFrame, RailStickyFooter } from "@/v2/RailFrame";',
    "rail holdings imports",
)
holdings_component = '''\nfunction HoldingsBlock({ summary }) {\n  if (!summary.count) return null;\n  const focus = summary.focus;\n  const otherProviders = summary.providers.filter((provider) => provider !== focus?.provider);\n  const focusLabel = focus?.active ? "Using" : focus?.primary ? "Primary holding" : "Known holding";\n  const focusContext = focus ? [focus.custodian, holdingRoleLabel(focus)].filter(Boolean).join(" · ") : "";\n  return (\n    <section\n      className="rd-v2-library-inspector-block rd-v2-library-inspector-holdings"\n      aria-label="Holdings"\n      data-testid="library-rail-holdings"\n    >\n      <p className="rd-v2-rail-section-label">Holdings</p>\n      <h3 className="rd-v2-library-rail-module-title">{summary.headline}</h3>\n      {focus ? (\n        <div className="rd-v2-library-holding-focus">\n          <span>{focusLabel}</span>\n          <strong>{focus.provider}</strong>\n          {focusContext ? <small>{focusContext}</small> : null}\n        </div>\n      ) : null}\n      {otherProviders.length ? (\n        <p className="rd-v2-library-holdings-provider-line">{otherProviders.join(" · ")}</p>\n      ) : null}\n    </section>\n  );\n}\n\n'''
p = Path(rail)
text = p.read_text()
anchor = "/**\n * The centre workspace owns asset substance"
if "function HoldingsBlock({ summary })" not in text:
    if anchor not in text:
        raise SystemExit("rail holdings component anchor missing")
    p.write_text(text.replace(anchor, holdings_component + anchor, 1))
replace_once(
    rail,
    '  const verification = libraryVerification(dataset);\n  const remedy = hydrateRemedy(dataset);',
    '  const verification = libraryVerification(dataset);\n  const holdings = summarizeLibraryHoldings(dataset);\n  const remedy = hydrateRemedy(dataset);',
    "rail holdings summary",
)
replace_once(
    rail,
    '        <DecisionBasis\n          state={state}\n          verification={verification}\n          dataset={dataset}\n          receipt={receipt}\n          previewOpen={previewOpen}\n          presentation={presentation}\n        />\n\n        <section className="rd-v2-library-inspector-block" aria-label="Source" data-testid="library-rail-source">',
    '        <DecisionBasis\n          state={state}\n          verification={verification}\n          dataset={dataset}\n          receipt={receipt}\n          previewOpen={previewOpen}\n          presentation={presentation}\n        />\n\n        <HoldingsBlock summary={holdings} />\n\n        <section className="rd-v2-library-inspector-block" aria-label="Source" data-testid="library-rail-source">',
    "rail holdings placement",
)
replace_once(
    rail,
    '            <Fact label="Library ID" value={dataset.dataset_id} mono />\n            <Fact label="Registry readiness" value={dataset.analysis_readiness || "not declared"} mono />',
    '            <Fact label="Library ID" value={dataset.dataset_id} mono />\n            {holdings.count ? <Fact label="Known holdings" value={String(holdings.count)} /> : null}\n            <Fact label="Registry readiness" value={dataset.analysis_readiness || "not declared"} mono />',
    "rail technical holdings count",
)

search = "drive/src/v2/librarySearch.js"
holding_group = '''    {\n      key: "holding",\n      label: "holding",\n      weight: 8,\n      values: values(row, ["holdings", "storage_holdings", "replicas", "storage_locations"]),\n    },\n'''
p = Path(search)
text = p.read_text()
anchor = '    {\n      key: "organization",\n      label: "collection",'
if 'key: "holding"' not in text:
    if anchor not in text:
        raise SystemExit("search holdings group anchor missing")
    p.write_text(text.replace(anchor, holding_group + anchor, 1))
replace_once(
    search,
    '"Explain each recommended match using recorded identity/topic, schema or fields, grain, coverage, source/provenance, readiness, and verification when those facts exist.",',
    '"Explain each recommended match using recorded identity/topic, schema or fields, grain, coverage, source/provenance, holdings/storage location, readiness, and verification when those facts exist.",',
    "search Ask holdings context",
)

css = Path("drive/src/v2/library-live-scale.css")
text = css.read_text()
if ".rd-v2-library-holding-focus {" not in text:
    text += '''\n\n/* Federated holdings: current storage topology stays visibly distinct from\n   source provenance. The rail gets a compact location summary; the centre\n   overlay owns copy-level provider, custodian, path, access, and sync state. */\n.rd-v2-library-holding-focus {\n  display: grid;\n  gap: 3px;\n  margin-top: 8px;\n  padding: 9px 10px;\n  border: 1px solid var(--rd-border2);\n  border-radius: 7px;\n  background: rgba(250, 249, 244, .48);\n}\n\n.rd-v2-library-holding-focus > span,\n.rd-v2-library-holding-location > span {\n  color: var(--rd-muted);\n  font-family: var(--rd-mono);\n  font-size: 8.5px;\n  font-weight: 760;\n  letter-spacing: .06em;\n  text-transform: uppercase;\n}\n\n.rd-v2-library-holding-focus strong {\n  color: var(--rd-text);\n  font-size: 11.5px;\n}\n\n.rd-v2-library-holding-focus small {\n  color: var(--rd-muted);\n  font-size: 10px;\n  line-height: 1.4;\n}\n\n.rd-v2-library-holdings-provider-line {\n  margin: 8px 0 0;\n  color: var(--rd-muted);\n  font-size: 10.5px;\n  line-height: 1.4;\n}\n\n.rd-v2-library-holdings-overlay {\n  width: min(100%, 720px);\n}\n\n.rd-v2-library-holdings-summary {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  margin: 2px 0 16px;\n  overflow: hidden;\n  border: 1px solid var(--rd-border2);\n  border-radius: 8px;\n  background: rgba(250, 249, 244, .45);\n}\n\n.rd-v2-library-holdings-summary > div {\n  min-width: 0;\n  padding: 10px 12px;\n}\n\n.rd-v2-library-holdings-summary > div + div {\n  border-left: 1px solid var(--rd-border);\n}\n\n.rd-v2-library-holdings-summary span {\n  display: block;\n  color: var(--rd-muted);\n  font-family: var(--rd-mono);\n  font-size: 8.5px;\n  font-weight: 760;\n  letter-spacing: .05em;\n  text-transform: uppercase;\n}\n\n.rd-v2-library-holdings-summary strong {\n  display: block;\n  margin-top: 3px;\n  color: var(--rd-text);\n  font-size: 17px;\n}\n\n.rd-v2-library-holding-list {\n  display: grid;\n  gap: 9px;\n}\n\n.rd-v2-library-holding-card {\n  padding: 12px 13px;\n  border: 1px solid var(--rd-border2);\n  border-radius: 9px;\n  background: rgba(255, 255, 255, .72);\n}\n\n.rd-v2-library-holding-card > header {\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: 14px;\n  margin: 0;\n}\n\n.rd-v2-library-holding-card h3 {\n  margin: 3px 0 0;\n  color: var(--rd-text);\n  font-size: 14px;\n}\n\n.rd-v2-library-holding-card header p {\n  margin: 3px 0 0;\n  color: var(--rd-muted);\n  font-size: 10.5px;\n}\n\n.rd-v2-library-holding-status {\n  display: flex;\n  flex-wrap: wrap;\n  justify-content: flex-end;\n  gap: 5px;\n}\n\n.rd-v2-library-holding-status span {\n  padding: 3px 6px;\n  border: 1px solid var(--rd-border2);\n  border-radius: 999px;\n  color: var(--rd-muted);\n  font-size: 9px;\n  font-weight: 650;\n}\n\n.rd-v2-library-holding-card[data-access="available"] .rd-v2-library-holding-status span:first-child {\n  border-color: rgba(63, 111, 92, .28);\n  background: rgba(63, 111, 92, .07);\n  color: #365447;\n}\n\n.rd-v2-library-holding-location {\n  display: grid;\n  gap: 4px;\n  margin-top: 10px;\n  padding-top: 9px;\n  border-top: 1px solid var(--rd-border);\n}\n\n.rd-v2-library-holding-location code {\n  color: var(--rd-body);\n  font-size: 10.5px;\n  overflow-wrap: anywhere;\n}\n\n.rd-v2-library-holding-meta {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 10px;\n  margin: 10px 0 0;\n}\n\n.rd-v2-library-holding-meta dt {\n  color: var(--rd-muted);\n  font-family: var(--rd-mono);\n  font-size: 8px;\n  font-weight: 760;\n  text-transform: uppercase;\n}\n\n.rd-v2-library-holding-meta dd {\n  margin: 3px 0 0;\n  color: var(--rd-body);\n  font-size: 9.5px;\n  overflow-wrap: anywhere;\n}\n\n@media (max-width: 760px) {\n  .rd-v2-library-holdings-summary,\n  .rd-v2-library-holding-meta {\n    grid-template-columns: 1fr;\n  }\n\n  .rd-v2-library-holdings-summary > div + div {\n    border-top: 1px solid var(--rd-border);\n    border-left: 0;\n  }\n\n  .rd-v2-library-holding-card > header {\n    display: grid;\n  }\n\n  .rd-v2-library-holding-status {\n    justify-content: flex-start;\n  }\n}\n'''
    css.write_text(text)
