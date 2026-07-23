import { useState } from "react";
import { buildAssetWorkspaceModel } from "@/v2/assetWorkspace";
import { StatusPill } from "@/v2/StatusPill";
import { Chip } from "@/v2/ui";

const TABS = [
  ["overview", "Overview"],
  ["fields", "Fields"],
  ["quality", "Quality"],
  ["provenance", "Provenance"],
];

function FactGroup({ title, items, testId, tone = "" }) {
  if (!items?.length) return null;
  return (
    <div className={`rd-v2-asset-fact-group${tone ? ` ${tone}` : ""}`} data-testid={testId}>
      <h3>{title}</h3>
      <dl>
        {items.map((item) => (
          <div key={`${title}-${item.label}`} className="rd-v2-asset-fact-row">
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function AssetWorkspace({
  dataset,
  onClearSelection,
  onPreview,
}) {
  const [tab, setTab] = useState("overview");
  const model = buildAssetWorkspaceModel(dataset);
  const section = model[tab] || { observed: [], unknown: [] };

  if (!dataset) return null;

  return (
    <section className="rd-v2-asset-workspace" aria-label="Asset workspace" data-testid="asset-workspace">
      <header className="rd-v2-asset-workspace-head">
        <div className="rd-v2-asset-workspace-copy">
          <button type="button" className="rd-v2-linkish" onClick={onClearSelection}>
            ← Back to directory
          </button>
          <h2>{model.title}</h2>
          <p className="mono">{model.id}</p>
        </div>
        <div className="rd-v2-asset-workspace-actions">
          {model.readiness ? (
            dataset.analysis_readiness ? (
              <StatusPill dataset={dataset} />
            ) : (
              <span className="rd-v2-pill">{model.readiness.label}</span>
            )
          ) : null}
          {onPreview ? (
            <button type="button" className="rd-v2-btn sm primary" onClick={() => onPreview(dataset)}>
              Preview rows
            </button>
          ) : null}
        </div>
      </header>

      <div className="rd-v2-asset-workspace-tabs" role="tablist" aria-label="Asset sections">
        {TABS.map(([id, label]) => (
          <Chip key={id} active={tab === id} onClick={() => setTab(id)}>
            {label}
          </Chip>
        ))}
      </div>

      <div className="rd-v2-asset-workspace-body" role="tabpanel" data-tab={tab}>
        <FactGroup
          title="Observed registry facts"
          items={section.observed}
          testId={`asset-${tab}-observed`}
        />
        <FactGroup
          title="Unknown / unverified"
          items={section.unknown}
          testId={`asset-${tab}-unknown`}
          tone="unknown"
        />
        {!section.observed.length && !section.unknown.length ? (
          <p className="rd-v2-asset-workspace-empty" role="status">
            No facts available for this section.
          </p>
        ) : null}
      </div>
    </section>
  );
}
