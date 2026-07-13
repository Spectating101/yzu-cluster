import { useEffect, useMemo, useState } from "react";
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getSmoothStepPath,
  useReactFlow,
} from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import { synthesisStatusMeta } from "@/v2/synthesisWorkspace";

const elk = new ELK();

const NODE_SIZES = {
  target: { width: 310, height: 118 },
  construct: { width: 200, height: 86 },
  source: { width: 226, height: 110 },
  process: { width: 226, height: 98 },
  output: { width: 294, height: 128 },
};

function sizeFor(node) {
  return NODE_SIZES[node.type] || NODE_SIZES.source;
}

async function layoutProject(project) {
  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": "34",
      "elk.layered.spacing.nodeNodeBetweenLayers": "54",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.padding": "[top=34,left=38,bottom=34,right=38]",
    },
    children: project.nodes.map((node) => {
      const size = sizeFor(node);
      return { id: node.id, width: size.width, height: size.height };
    }),
    edges: project.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const result = await elk.layout(graph);
  const positions = new Map((result.children || []).map((node) => [node.id, node]));
  const nodes = project.nodes.map((node) => {
    const placed = positions.get(node.id) || { x: 0, y: 0 };
    const size = sizeFor(node);
    return {
      id: node.id,
      type: "researchNode",
      position: { x: placed.x || 0, y: placed.y || 0 },
      width: size.width,
      height: size.height,
      style: { width: size.width, height: size.height },
      data: { ...node },
    };
  });
  const edges = project.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "semanticEdge",
    markerEnd: { type: MarkerType.ArrowClosed },
    data: { ...edge },
  }));
  return { nodes, edges };
}

function progressTone(index, total, status) {
  if (status === "missing") return "missing";
  if (status === "proposed") return index === total - 1 ? "active" : "done";
  if (status === "queryable" || status === "sourceable" || status === "needs_access") {
    return index === total - 1 ? "active" : "done";
  }
  return "done";
}

function ResearchNode({ data, selected }) {
  const meta = synthesisStatusMeta(data.status);
  const progress = Array.isArray(data.progress) ? data.progress.slice(0, 3) : [];
  const detail = data.detailLevel || "normal";
  const metadata = [data.source, data.grain, data.coverage].filter(Boolean).slice(0, 2);

  return (
    <article
      className={`rd-syn-graph-node is-${data.type} status-${meta.tone}${selected ? " is-selected" : ""}${data.dimmed ? " is-dimmed" : ""} detail-${detail}`}
      data-testid="synthesis-graph-node"
      data-node-id={data.id}
    >
      <Handle type="target" position={Position.Top} className="rd-syn-handle" />
      <div className="rd-syn-node-head">
        <span className="rd-syn-node-eyebrow">{data.eyebrow || data.type}</span>
        <span className={`rd-syn-node-state tone-${meta.tone}`}>
          <i /> {meta.label}
        </span>
      </div>
      <h3>{data.label}</h3>
      <p className="rd-syn-node-role">{data.role || data.interpretation}</p>
      {detail === "detail" && data.interpretation ? (
        <p className="rd-syn-node-interpretation">{data.interpretation}</p>
      ) : null}
      {detail !== "compact" && metadata.length ? (
        <div className="rd-syn-node-meta">
          {metadata.map((value) => <span key={value}>{value}</span>)}
        </div>
      ) : null}
      {detail !== "compact" && progress.length ? (
        <div className="rd-syn-node-progress" aria-label="Progress">
          {progress.map((item, index) => (
            <span key={item} className={`is-${progressTone(index, progress.length, data.status)}`} title={item} />
          ))}
        </div>
      ) : null}
      <Handle type="source" position={Position.Bottom} className="rd-syn-handle" />
    </article>
  );
}

function SemanticEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 18,
    offset: 20,
  });
  const relation = data?.relation || "supports";
  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={markerEnd}
        className={`rd-syn-semantic-edge relation-${relation}${data?.active ? " is-active" : ""}${data?.dimmed ? " is-dimmed" : ""}`}
      />
      {data?.label && !data?.dimmed ? (
        <EdgeLabelRenderer>
          <span
            className={`rd-syn-edge-label relation-${relation}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {data.label}
          </span>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

const nodeTypes = { researchNode: ResearchNode };
const edgeTypes = { semanticEdge: SemanticEdge };

function graphFocus(project, selectedNodeId) {
  if (!selectedNodeId) return null;
  const focus = new Set([selectedNodeId]);
  project.edges.forEach((edge) => {
    if (edge.source === selectedNodeId) focus.add(edge.target);
    if (edge.target === selectedNodeId) focus.add(edge.source);
  });
  return focus;
}

function SynthesisGraphInner({ project, selectedNodeId, onSelectNode }) {
  const { fitView } = useReactFlow();
  const [layout, setLayout] = useState({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(0.85);

  useEffect(() => {
    let active = true;
    setLoading(true);
    layoutProject(project)
      .then((next) => {
        if (!active) return;
        setLayout(next);
        setLoading(false);
        window.requestAnimationFrame(() => {
          const mobile = window.matchMedia?.("(max-width: 720px)").matches;
          fitView(
            mobile
              ? { padding: 0.06, duration: 520, minZoom: 0.58, maxZoom: 1.08 }
              : { nodes: next.nodes, padding: 0.07, duration: 520, minZoom: 0.4, maxZoom: 0.78 },
          );
        });
      })
      .catch(() => {
        if (!active) return;
        setLayout({ nodes: [], edges: [] });
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [project, fitView]);

  const detailLevel = zoom < 0.62 ? "compact" : zoom > 1.02 ? "detail" : "normal";
  const focus = useMemo(() => graphFocus(project, selectedNodeId), [project, selectedNodeId]);
  const nodes = useMemo(
    () => layout.nodes.map((node) => ({
      ...node,
      selected: node.id === selectedNodeId,
      data: {
        ...node.data,
        detailLevel,
        dimmed: Boolean(focus && !focus.has(node.id)),
      },
    })),
    [layout.nodes, selectedNodeId, detailLevel, focus],
  );
  const edges = useMemo(
    () => layout.edges.map((edge) => ({
      ...edge,
      data: {
        ...edge.data,
        active: Boolean(selectedNodeId && (edge.source === selectedNodeId || edge.target === selectedNodeId)),
        dimmed: Boolean(focus && (!focus.has(edge.source) || !focus.has(edge.target))),
      },
    })),
    [layout.edges, selectedNodeId, focus],
  );

  return (
    <div className="rd-syn-map" data-testid="synthesis-construction-map">
      {loading ? <div className="rd-syn-map-loading">Composing research map…</div> : null}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        panOnScroll
        zoomOnDoubleClick={false}
        minZoom={0.5}
        maxZoom={1.5}
        onMove={(_, viewport) => setZoom(viewport.zoom)}
        onNodeClick={(_, node) => onSelectNode?.(project.nodes.find((item) => item.id === node.id) || null)}
        onPaneClick={() => onSelectNode?.(null)}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1} className="rd-syn-map-background" />
        <Controls showInteractive={false} className="rd-syn-map-controls" />
        <MiniMap
          pannable={false}
          zoomable={false}
          style={{ pointerEvents: "none" }}
          className="rd-syn-minimap"
          nodeColor={(node) => {
            const status = node?.data?.status;
            if (status === "derived") return "#4e5fe8";
            if (status === "missing") return "#ba7659";
            if (status === "proposed") return "#d39a3b";
            if (status === "held") return "#3f9c74";
            if (status === "queryable") return "#5d7dd8";
            if (status === "process") return "#7d6ac5";
            return "#8590a6";
          }}
        />
        <Panel position="top-left" className="rd-syn-map-caption">
          <strong>Construction map</strong>
          <span>{detailLevel === "compact" ? "Concept view" : detailLevel === "detail" ? "Evidence detail" : "Source view"}</span>
        </Panel>
        <Panel position="top-right" className="rd-syn-map-legend" aria-label="Synthesis state legend">
          <span><i className="held" /> Held</span>
          <span><i className="queryable" /> Reachable</span>
          <span><i className="proposed" /> Proposed</span>
          <span><i className="missing" /> Missing</span>
        </Panel>
      </ReactFlow>
    </div>
  );
}

export function SynthesisGraphCanvas(props) {
  return (
    <ReactFlowProvider>
      <SynthesisGraphInner {...props} />
    </ReactFlowProvider>
  );
}
