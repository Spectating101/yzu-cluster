import { useEffect, useMemo, useState } from "react";
import { getSynthesisProfile, listSynthesisProfiles } from "@/v2/api";
import { SynthesisGraphCanvas } from "@/v2/SynthesisGraphCanvas";
import {
  ATTENTION_SYNTHESIS_PROJECT,
  applyProjectProposal,
  projectFromSynthesisProfile,
  rejectProjectProposal,
  synthesisNodeObject,
  synthesisProjectObject,
  synthesisProjectStats,
} from "@/v2/synthesisWorkspace";
import { PageShell } from "@/v2/ui";

const VIEW_TABS = [
  ["map", "Map"],
  ["spec", "Spec"],
  ["data", "Data"],
  ["charts", "Charts"],
];

function profileRows(payload) {
  if (Array.isArray(payload)) return payload;
  return payload?.profiles || payload?.items || payload?.results || [];
}

function readableMaterialisation(value) {
  return String(value || "not_materialised").replaceAll("_", " ");
}

function ProjectTabs({ projects, activeId, onChange, onNew }) {
  return (
    <div className="rd-syn-project-tabs" role="tablist" aria-label="Open synthesis work">
      <div className="rd-syn-project-tab-scroll">
        {projects.slice(0, 5).map((project) => (
          <button
            key={project.id}
            type="button"
            role="tab"
            aria-selected={project.id === activeId}
            className={project.id === activeId ? "is-active" : ""}
            onClick={() => onChange(project.id)}
          >
            <span className="rd-syn-tab-mark" />
            <span>{project.title}</span>
            {project.id === activeId ? <b aria-hidden>×</b> : null}
          </button>
        ))}
      </div>
      <button type="button" className="rd-syn-new-project" onClick={onNew} aria-label="Start new synthesis">
        ＋
      </button>
    </div>
  );
}

function ProjectHeader({ project, stats, view, onView, onAsk }) {
  return (
    <header className="rd-syn-project-head">
      <div className="rd-syn-project-copy">
        <div className="rd-syn-project-kicker">
          <span className={`rd-syn-maturity is-${project.maturity}`}>{project.maturityLabel}</span>
          <span>{stats.held} held</span>
          {stats.queryable ? <span>{stats.queryable} queryable</span> : null}
          {stats.proposed ? <span>{stats.proposed} proposed</span> : null}
          {stats.missing ? <span>{stats.missing} ideal gap</span> : null}
        </div>
        <h2>{project.title}</h2>
        <p>{project.objective}</p>
      </div>
      <button type="button" className="rd-syn-ask-project" onClick={onAsk}>
        <span>✦</span>
        Ask about synthesis
      </button>
      <nav className="rd-syn-view-tabs" aria-label="Synthesis workspace views">
        {VIEW_TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-current={view === id ? "page" : undefined}
            className={view === id ? "is-active" : ""}
            onClick={() => onView(id)}
          >
            {label}
          </button>
        ))}
      </nav>
    </header>
  );
}

function ProposalBar({ proposal, onReview, onApply, onReject }) {
  if (!proposal) return null;
  return (
    <aside className="rd-syn-proposal" data-testid="synthesis-proposal">
      <div className="rd-syn-proposal-mark" aria-hidden>✦</div>
      <div className="rd-syn-proposal-copy">
        <span>Agent proposal</span>
        <strong>{proposal.title}</strong>
        <p>{proposal.summary}</p>
        <div>
          {(proposal.impact || []).map((item) => <small key={item}>{item}</small>)}
        </div>
      </div>
      <div className="rd-syn-proposal-actions">
        <button type="button" onClick={onReview}>Review</button>
        <button type="button" className="primary" onClick={onApply}>Apply</button>
        <button type="button" className="quiet" onClick={onReject}>Reject</button>
      </div>
    </aside>
  );
}

function MapView({ project, selectedNodeId, onSelectNode, onReviewProposal, onApplyProposal, onRejectProposal }) {
  return (
    <section className="rd-syn-map-view" aria-label="Construction map">
      <SynthesisGraphCanvas
        project={project}
        selectedNodeId={selectedNodeId}
        onSelectNode={onSelectNode}
      />
      <ProposalBar
        proposal={project.proposal}
        onReview={onReviewProposal}
        onApply={onApplyProposal}
        onReject={onRejectProposal}
      />
    </section>
  );
}

function SpecView({ project }) {
  const spec = project.spec || {};
  return (
    <section className="rd-syn-spec-view" data-testid="synthesis-spec-view">
      <article className="rd-syn-spec-document">
        <span className="rd-syn-doc-kicker">Research asset specification</span>
        <h3>{project.title}</h3>
        <p className="rd-syn-doc-purpose">{spec.purpose || project.objective}</p>
        <div className="rd-syn-doc-fact">
          <span>Target grain</span>
          <strong>{spec.grain || "Not resolved"}</strong>
        </div>
        <section>
          <h4>Core evidence</h4>
          <div className="rd-syn-doc-evidence">
            {(spec.coreEvidence || []).map(([name, role]) => (
              <div key={name}><span>✓</span><strong>{name}</strong><small>{role}</small></div>
            ))}
          </div>
        </section>
        {(spec.validation || []).length ? (
          <section>
            <h4>Validation</h4>
            <div className="rd-syn-doc-evidence validation">
              {spec.validation.map(([name, role]) => (
                <div key={name}><span>◇</span><strong>{name}</strong><small>{role}</small></div>
              ))}
            </div>
          </section>
        ) : null}
        {(spec.unavailable || []).length ? (
          <section>
            <h4>Ideal evidence unavailable</h4>
            <div className="rd-syn-doc-evidence unavailable">
              {spec.unavailable.map(([name, role]) => (
                <div key={name}><span>×</span><strong>{name}</strong><small>{role}</small></div>
              ))}
            </div>
          </section>
        ) : null}
        <section>
          <h4>Construction</h4>
          <ol className="rd-syn-doc-steps">
            {(spec.construction || []).map((step) => <li key={step}>{step}</li>)}
          </ol>
        </section>
        <section>
          <h4>Known limitations</h4>
          <ul className="rd-syn-doc-limitations">
            {(spec.limitations || []).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      </article>
      <aside className="rd-syn-spec-margin">
        <span>State</span>
        <strong>{project.maturityLabel}</strong>
        <small>{readableMaterialisation(project.materialisation)}</small>
        <hr />
        <span>Why this exists</span>
        <p>The specification persists what the agent and researcher have agreed before data is materialised.</p>
      </aside>
    </section>
  );
}

function DataView({ project }) {
  const sourceNodes = project.nodes.filter((node) => node.type === "source");
  return (
    <section className="rd-syn-data-view" data-testid="synthesis-data-view">
      <div className="rd-syn-data-toolbar">
        <div>
          <strong>Working data shape</strong>
          <span>Specification preview · no rows materialised</span>
        </div>
        <button type="button" disabled>Preview rows</button>
      </div>
      <div className="rd-syn-data-grid">
        <section>
          <header><span>Evidence inventory</span><small>{sourceNodes.length} mapped sources</small></header>
          <div className="rd-syn-data-table sources">
            <div className="head"><span>Source</span><span>State</span><span>Grain</span><span>Role</span></div>
            {sourceNodes.map((node) => (
              <div key={node.id}>
                <span><strong>{node.label}</strong><small>{node.source || "—"}</small></span>
                <span className={`state is-${node.status}`}>{node.status.replaceAll("_", " ")}</span>
                <span className="mono">{node.grain || "—"}</span>
                <span>{node.role || "—"}</span>
              </div>
            ))}
          </div>
        </section>
        <section>
          <header><span>Planned output schema</span><small>{project.plannedColumns?.length || 0} fields</small></header>
          {project.plannedColumns?.length ? (
            <div className="rd-syn-data-table schema">
              <div className="head"><span>Field</span><span>Meaning</span><span>Role</span></div>
              {project.plannedColumns.map(([name, meaning, role]) => (
                <div key={name}>
                  <span className="mono">{name}</span>
                  <span>{meaning}</span>
                  <span className={`schema-role is-${role}`}>{role}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rd-syn-data-empty">This registered profile does not expose a planned schema yet.</div>
          )}
        </section>
      </div>
    </section>
  );
}

function parseCoverage(value) {
  const years = String(value || "").match(/(?:19|20)\d{2}/g) || [];
  if (!years.length) return null;
  return { start: Number(years[0]), end: Number(years.at(-1)) || 2026 };
}

function ChartsView({ project, onAsk }) {
  const sources = project.nodes
    .filter((node) => node.type === "source")
    .map((node) => ({ ...node, span: parseCoverage(node.coverage) }))
    .filter((node) => node.span);
  const minYear = Math.min(...sources.map((node) => node.span.start), 2021);
  const maxYear = Math.max(...sources.map((node) => node.span.end), 2026);
  const range = Math.max(1, maxYear - minYear);

  return (
    <section className="rd-syn-charts-view" data-testid="synthesis-charts-view">
      <article className="rd-syn-coverage-chart">
        <header>
          <div><span>Evidence coverage</span><strong>{minYear} → {maxYear}</strong></div>
          <small>Registry metadata · not row counts</small>
        </header>
        <div className="rd-syn-coverage-years">
          {[minYear, Math.round(minYear + range / 3), Math.round(minYear + (2 * range) / 3), maxYear].map((year) => <span key={year}>{year}</span>)}
        </div>
        <div className="rd-syn-coverage-bars">
          {sources.map((node) => {
            const left = ((node.span.start - minYear) / range) * 100;
            const width = Math.max(4, ((node.span.end - node.span.start) / range) * 100);
            return (
              <div key={node.id}>
                <span>{node.label}</span>
                <div><i className={`is-${node.status}`} style={{ left: `${left}%`, width: `${Math.min(100 - left, width)}%` }} /></div>
              </div>
            );
          })}
        </div>
      </article>
      <div className="rd-syn-chart-ideas">
        {(project.chartIdeas || []).map(([title, description]) => (
          <button key={title} type="button" onClick={() => onAsk?.(title)}>
            <span>✦</span>
            <strong>{title}</strong>
            <p>{description}</p>
            <small>Ask agent to preview →</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function ActivityPanel({ project, open, onToggle }) {
  return (
    <section className={`rd-syn-activity${open ? " is-open" : ""}`}>
      <button type="button" className="rd-syn-activity-toggle" onClick={onToggle} aria-expanded={open}>
        <span><i /> Activity</span>
        <strong>{project.activity?.length || 0} events</strong>
        <span>{open ? "⌄" : "⌃"}</span>
      </button>
      {open ? (
        <div className="rd-syn-activity-log">
          {(project.activity || []).slice().reverse().map((item, index) => (
            <div key={`${item.time}-${item.message}-${index}`}>
              <time>{item.time}</time>
              <span className={`is-${item.kind}`} />
              <p>{item.message}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function SynthesisPage({ datasets = [], onAskComposer, onSelectObject }) {
  const [registryProjects, setRegistryProjects] = useState([]);
  const [projectOverrides, setProjectOverrides] = useState({});
  const [activeId, setActiveId] = useState(ATTENTION_SYNTHESIS_PROJECT.id);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [view, setView] = useState("map");
  const [activityOpen, setActivityOpen] = useState(false);

  useEffect(() => {
    let active = true;
    listSynthesisProfiles()
      .then(async (payload) => {
        const rows = profileRows(payload).slice(0, 4);
        const details = await Promise.all(rows.map(async (row) => {
          const id = row?.profile_id || row?.id || row?.key || row?.name;
          if (!id) return row;
          if (row?.inputs || row?.sources || row?.datasets || row?.peer_sources) return row;
          try {
            const detail = await getSynthesisProfile(id);
            return detail?.profile || detail || row;
          } catch {
            return row;
          }
        }));
        if (!active) return;
        setRegistryProjects(details.map((row) => projectFromSynthesisProfile(row, datasets)).filter(Boolean));
      })
      .catch(() => {
        if (active) setRegistryProjects([]);
      });
    return () => {
      active = false;
    };
  }, [datasets]);

  const baseProjects = useMemo(
    () => [ATTENTION_SYNTHESIS_PROJECT, ...registryProjects.filter((project) => project.id !== ATTENTION_SYNTHESIS_PROJECT.id)],
    [registryProjects],
  );
  const projects = useMemo(
    () => baseProjects.map((project) => projectOverrides[project.id] || project),
    [baseProjects, projectOverrides],
  );
  const project = projects.find((item) => item.id === activeId) || projects[0];
  const stats = synthesisProjectStats(project);

  useEffect(() => {
    if (!project) return;
    const node = selectedNodeId ? project.nodes.find((item) => item.id === selectedNodeId) : null;
    onSelectObject?.(node ? synthesisNodeObject(project, node) : synthesisProjectObject(project));
  }, [project, selectedNodeId, onSelectObject]);

  const selectProject = (id) => {
    setActiveId(id);
    setSelectedNodeId("");
    setView("map");
    setActivityOpen(false);
  };

  const selectNode = (node) => setSelectedNodeId(node?.id || "");
  const askProject = () => onAskComposer?.({
    prompt: `Work on the synthesis "${project.title}". Objective: ${project.objective} Review the current construction state, held and reachable evidence, measurement gaps, unresolved methodological decisions, and propose the strongest defensible next change. Treat any graph change as a proposal until the researcher approves it.`,
    displayText: `Work on ${project.title}`,
  });
  const askChart = (chartTitle) => onAskComposer?.({
    prompt: `For the synthesis "${project.title}", propose a ${chartTitle} preview using only evidence currently held or honestly queryable. Explain which actual fields and source states are required; do not invent values.`,
    displayText: `Preview ${chartTitle}`,
  });
  const startNew = () => onAskComposer?.({
    prompt: "Start a new research-data synthesis. Ask me what research construct, historical measure, panel, proxy, event set, or derived research asset I need. Then search the lab and indexed source capabilities before proposing a construction state.",
    displayText: "Start a new synthesis",
  });
  const applyProposal = () => {
    const next = applyProjectProposal(project);
    setProjectOverrides((current) => ({ ...current, [project.id]: next }));
    setSelectedNodeId(project.proposal?.nodeId || "");
  };
  const rejectProposal = () => {
    const next = rejectProjectProposal(project);
    setProjectOverrides((current) => ({ ...current, [project.id]: next }));
    setSelectedNodeId("");
  };

  if (!project) return null;

  return (
    <PageShell
      className="rd-v2-synthesis-page"
      title="Synthesis"
      lead="Construct research assets from the lab and the reachable data universe."
    >
      <div className="rd-syn-workbench" data-testid="synthesis-workbench">
        <ProjectTabs projects={projects} activeId={project.id} onChange={selectProject} onNew={startNew} />
        <ProjectHeader project={project} stats={stats} view={view} onView={setView} onAsk={askProject} />
        <main className="rd-syn-editor-surface">
          {view === "map" ? (
            <MapView
              project={project}
              selectedNodeId={selectedNodeId}
              onSelectNode={selectNode}
              onReviewProposal={() => selectNode(project.nodes.find((node) => node.id === project.proposal?.nodeId))}
              onApplyProposal={applyProposal}
              onRejectProposal={rejectProposal}
            />
          ) : view === "spec" ? (
            <SpecView project={project} />
          ) : view === "data" ? (
            <DataView project={project} />
          ) : (
            <ChartsView project={project} onAsk={askChart} />
          )}
        </main>
        <ActivityPanel project={project} open={activityOpen} onToggle={() => setActivityOpen((current) => !current)} />
        <footer className="rd-syn-statusbar">
          <span>{project.maturityLabel}</span>
          <span>{stats.held} held</span>
          <span>{stats.queryable} queryable</span>
          <span>{stats.proposed} proposed</span>
          <span>{stats.openDecisions} decisions open</span>
          <strong>{readableMaterialisation(project.materialisation)}</strong>
        </footer>
      </div>
    </PageShell>
  );
}
