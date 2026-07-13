import {
  RailDecisionSummary,
  RailEntityHeader,
  RailField,
  RailFieldGrid,
  RailFrame,
  RailStickyFooter,
} from "@/v2/RailFrame";
import { synthesisStatusMeta } from "@/v2/synthesisWorkspace";

function pillClass(status) {
  if (status === "held" || status === "derived") return " lab";
  if (status === "queryable" || status === "sourceable") return " ext";
  if (status === "missing" || status === "proposed" || status === "needs_access") return " warn";
  return " muted";
}

function connectionText(object, direction) {
  const node = object?.row;
  const project = object?.project;
  if (!node || !project) return "—";
  const nodeNames = new Map((project.nodes || []).map((item) => [item.id, item.label]));
  const edges = (project.edges || []).filter((edge) =>
    direction === "in" ? edge.target === node.id : edge.source === node.id,
  );
  if (!edges.length) return "—";
  return edges
    .slice(0, 4)
    .map((edge) => {
      const other = direction === "in" ? edge.source : edge.target;
      const relation = edge.label || edge.relation || "linked";
      return `${nodeNames.get(other) || other} · ${relation}`;
    })
    .join("\n");
}

function ProjectRail({ object, onAskAbout }) {
  const row = object?.row || {};
  const stats = row.stats || {};
  const decisions = row.decisions || [];
  const execution = row.execution || {};
  const registered = execution.status === "registered";
  const failed = execution.status === "failed" || execution.status === "cancelled";
  const unformed =
    String(row.maturity || "").toLowerCase().includes("working brief") ||
    String(row.maturity || "").toLowerCase() === "unformed" ||
    ((stats.held || 0) === 0 &&
      (stats.queryable || 0) === 0 &&
      (stats.proposed || 0) === 0 &&
      (stats.missing || 0) === 0 &&
      !(object?.project?.nodes || []).length);
  return (
    <RailFrame>
      <RailEntityHeader
        id={object?.id}
        title={object?.title || "Synthesis"}
        description={object?.objective || "AI-maintained research construction workspace."}
        pills={<span className={`rd-v2-pill ${registered ? "lab" : failed ? "warn" : "ext"}`}>{registered ? "Registered" : failed ? "Execution failed" : row.maturity || "Exploring"}</span>}
      />
      <div className="rd-v2-rail-scroll rd-syn-rail-scroll">
        <RailDecisionSummary
          status={registered ? "Registered" : failed ? "Execution failed" : row.maturity || "Exploring"}
          primary={registered ? "Open registered asset" : failed ? "Review failure and retry" : unformed ? "Continue in Ask" : "Inspect the construction map"}
          risk={
            registered
              ? unformed ? "Method record has no evidence map" : "No unresolved execution risk"
              : failed
                ? execution.error || execution.message || "Execution did not complete"
              : unformed
              ? "No evidence mapped yet"
              : stats.missing
                ? `${stats.missing} ideal measure missing`
                : "No mapped measurement gap"
          }
          next={
            registered
              ? "Inspect the registered asset in Library"
              : failed
                ? "Retry the accepted bounded specification"
              : unformed
              ? "Search held and indexed evidence before construction"
              : stats.openDecisions
                ? `Resolve ${stats.openDecisions} construction decisions`
                : "Review materialisation"
          }
        />
        <RailFieldGrid>
          <RailField label="Held evidence" value={String(stats.held || 0)} />
          <RailField label="Queryable" value={String(stats.queryable || 0)} />
          <RailField label="Proposed" value={String(stats.proposed || 0)} />
          <RailField label="Open decisions" value={String(stats.openDecisions || 0)} />
          <RailField label="Materialisation" value={String(row.materialisation || "not_materialised").replaceAll("_", " ")} />
          {execution.status ? <RailField label="Execution" value={String(execution.status).replaceAll("_", " ")} /> : null}
          {registered ? <RailField label="Output rows" value={String(execution.rows ?? "—")} /> : null}
          {registered ? <RailField label="Manifest" value={execution.manifest_id || execution.output_manifest_id || "Recorded"} mono /> : null}
          {registered ? <RailField label="Drive archive" value={execution.drive_verified === true ? "verified" : "not reported"} /> : null}
          <RailField label="Latest" value={row.lastActivity || "—"} />
        </RailFieldGrid>
        {decisions.length ? (
          <section className="rd-syn-rail-progress">
            <p className="rd-v2-rail-section-label">Open decisions</p>
            {decisions.map((decision) => (
              <div key={decision.id}>
                <span className={decision.status === "resolved" ? "is-done" : "is-open"} />
                <p><strong>{decision.label}</strong><small>{decision.detail}</small></p>
              </div>
            ))}
          </section>
        ) : null}
      </div>
      <RailStickyFooter>
        <button type="button" className="rd-v2-btn sm primary" onClick={() => onAskAbout?.(object)}>
          Ask about this synthesis →
        </button>
      </RailStickyFooter>
    </RailFrame>
  );
}

export function SynthesisRailPanel({ object, onAskAbout }) {
  if (!object || object.kind === "synthesis_project") {
    return <ProjectRail object={object} onAskAbout={onAskAbout} />;
  }

  const node = object.row || {};
  const meta = synthesisStatusMeta(node.status);
  const progress = Array.isArray(node.progress) ? node.progress : [];
  const risk =
    node.status === "missing"
      ? "Evidence unavailable"
      : node.status === "proposed"
        ? "Role awaiting review"
        : node.status === "needs_access"
          ? "Access required"
          : "Low at current state";
  const next = progress.at(-1) || (node.status === "derived" ? "Review materialisation" : "Inspect in synthesis");

  return (
    <RailFrame>
      <RailEntityHeader
        id={node.id}
        title={node.label}
        description={node.interpretation || node.role}
        pills={<span className={`rd-v2-pill${pillClass(node.status)}`}>{meta.label}</span>}
      />
      <div className="rd-v2-rail-scroll rd-syn-rail-scroll">
        <RailDecisionSummary
          status={meta.label}
          primary={node.role || "Synthesis evidence"}
          risk={risk}
          next={next}
        />
        <RailFieldGrid>
          <RailField label="Synthesis role" value={node.role} />
          {node.source ? <RailField label="Source" value={node.source} /> : null}
          {node.coverage ? <RailField label="Coverage" value={node.coverage} /> : null}
          {node.grain ? <RailField label="Grain" value={node.grain} mono /> : null}
          <RailField label="Receives from" value={connectionText(object, "in")} />
          <RailField label="Feeds" value={connectionText(object, "out")} />
        </RailFieldGrid>
        {progress.length ? (
          <section className="rd-syn-rail-progress">
            <p className="rd-v2-rail-section-label">Progress</p>
            {progress.map((item, index) => (
              <div key={item}>
                <span className={node.status === "missing" && index === progress.length - 1 ? "is-blocked" : index === progress.length - 1 && /await|unresolved|not materialised/i.test(item) ? "is-open" : "is-done"} />
                <p><strong>{item}</strong></p>
              </div>
            ))}
          </section>
        ) : null}
      </div>
      <RailStickyFooter>
        {(node.status === "queryable" || node.status === "sourceable" || node.status === "proposed") ? (
          <button
            type="button"
            className="rd-v2-btn sm"
            onClick={() => onAskAbout?.(object, {
              prompt: `Inspect the access and research suitability of ${node.label} for ${object.projectTitle}. Explain what it measures, the safest acquisition or query route, and what should be verified before changing the synthesis state.`,
              displayText: `Inspect ${node.label}`,
            })}
          >
            Inspect route
          </button>
        ) : null}
        <button type="button" className="rd-v2-btn sm primary" onClick={() => onAskAbout?.(object)}>
          Ask about this →
        </button>
      </RailStickyFooter>
    </RailFrame>
  );
}
