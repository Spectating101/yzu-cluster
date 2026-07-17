import { useEffect, useRef, useState } from "react";
import { PageShell } from "@/v2/ui";

const INTENT = "Reconstruct a defensible weekly measure of public attention to individual stablecoins from 2021 onward using evidence available to the lab.";
const THREADS = [["Stablecoin attention", "Exploration ready"], ["Incident response", "Draft method"], ["JKSE PIT revisions", "Registered"]];
const STEPS = ["Explore", "Design", "Test", "Build", "Registered"];
const SOURCES = [["Search intent", "Google Trends", "asset-week"], ["Community activity", "Reddit", "asset-week"], ["Public visibility", "Wikipedia", "asset-day"]];

function fromUrl() {
  if (typeof window === "undefined") return "explore";
  const state = new URLSearchParams(window.location.search).get("synthesis_state");
  return ["intent", "explore", "design", "test", "build", "failed", "registered", "stale"].includes(state) ? state : "explore";
}

function label(state) {
  return ({ intent: "New synthesis", explore: "Exploration ready", design: "Method design", test: "Preview ready", build: "Build in progress", failed: "Build failed", registered: "Registered", stale: "Refresh available" })[state] || "Synthesis";
}

function StepRail({ state }) {
  if (["intent", "explore"].includes(state)) return null;
  const effective = state === "failed" ? "build" : state === "stale" ? "registered" : state;
  const current = ["explore", "design", "test", "build", "registered"].indexOf(effective);
  return <ol className="s04-steps">{STEPS.map((step, i) => <li key={step} className={i < current ? "done" : i === current ? "now" : ""}><span>{i < current ? "✓" : i + 1}</span>{step}</li>)}</ol>;
}

function AskPanel({ state, ask, compare }) {
  const copy =
    state === "design"
      ? ["One decision needed", "Component weighting", "Equal weighting is transparent and avoids unsupported confidence in source reliability."]
      : state === "test"
        ? ["Preview warning", "Component imbalance", "Reddit contributes more than 60% of weekly variance for six assets."]
        : state === "build"
          ? ["Current operation", "Building accepted revision", "Source revisions are locked while output-key, lineage, and source-consistency checks run."]
          : state === "failed"
            ? ["Failure", "Build stopped safely", "No manifest was accepted and no Library asset was registered."]
            : state === "registered"
              ? ["Registered asset", "Verified and query ready", "The accepted construction, source revisions, manifest, and Library identity are now durable."]
              : state === "stale"
                ? ["Freshness review", "New source revisions available", "The registered asset remains valid; review the source changes before creating a new version."]
                : ["AI interpretation", "Longitudinal attention measure", "The request is interpreted as a reusable longitudinal measure rather than an event-only dataset."];
  const questions =
    state === "design"
      ? ["Why equal weighting?", "What changes if all components are required?", "Show the full method."]
      : state === "test"
        ? ["Explain the warning.", "Which assets are affected?", "Compare redesign options."]
        : state === "build"
          ? ["What is being written now?", "Which revisions are locked?", "What could still fail?"]
          : state === "failed"
            ? ["Explain the failure.", "What remained unchanged?", "Is retry safe?"]
            : state === "registered" || state === "stale"
              ? ["Can this support a DiD?", "What are the identification risks?", "Draft a refresh policy."]
              : ["Why is GDELT validation?", "Compare alternatives.", "What will I decide later?"];
  return <aside className="s04-ask">
    <header><div><small>Ask context</small><strong>{label(state)}</strong></div><i /></header>
    <section><small>{copy[0]}</small><h3>{copy[1]}</h3><p>{copy[2]}</p>{state === "explore" ? <button onClick={compare}>Make event response primary</button> : null}</section>
    {state === "explore" ? <section><small>Why this route</small><ul><li>Best longitudinal coverage</li><li>Complementary evidence roles</li><li>Transparent proxy construction</li></ul></section> : null}
    <section className="s04-questions"><small>Quick questions</small>{questions.map(q => <button key={q} onClick={() => ask(q)}>{q}</button>)}</section>
    <button className="s04-askbox" onClick={() => ask("Help me refine this synthesis using the full current thread.")}>Correct, constrain, or ask…</button>
  </aside>;
}

function Explore({ accept, compare }) {
  return <section className="s04-card" data-testid="synthesis-recommendation">
    <header className="s04-title"><div><small>Recommended construction</small><h2>Composite weekly attention index</h2></div><em>Recommended</em></header>
    <div className="s04-map" role="img" aria-label="Google Trends, Reddit, and Wikipedia combine into a weekly attention index validated against GDELT news">
      <strong className="target">Historical stablecoin attention</strong><b>↓</b>
      <div className="sources">{SOURCES.map(([role, name, grain]) => <article key={name}><small>{role}</small><strong>{name}</strong><span>{grain}</span></article>)}</div>
      <b>↓</b><span className="process">Align entities · aggregate weeks · normalise</span><b>↓</b><strong className="output">Composite attention index</strong>
      <div className="validation"><span>validate against</span><article><small>External visibility</small><strong>GDELT news</strong><span>event-day</span></article></div>
    </div>
    <div className="s04-pairs"><article><small>Expected output</small><strong>Stablecoin attention weekly panel</strong><p>asset-week · 2021–2026 · reusable Library asset</p></article><article><small>Unavailable ideal</small><strong>Historical X follower growth</strong><p>No verified longitudinal route; this remains an observable proxy.</p></article></div>
    <div className="s04-resolved"><span><small>AI resolved</small>source roles · grain · validation · identity strategy</span><span><small>Method design resolves</small>weighting · missing-component rule</span></div>
    <button className="s04-alts" onClick={compare}>2 alternative constructions available <b>›</b></button>
    <footer className="s04-actions"><p><small>What happens next</small>Accepting drafts the detailed method and surfaces only material choices. It does not build data.</p><button className="rd-v2-btn" onClick={compare}>Compare alternatives</button><button className="rd-v2-btn primary" onClick={accept}>Accept &amp; design method</button></footer>
  </section>;
}

function Design({ weighting, setWeighting, next, ask }) {
  return <section className="s04-card" data-testid="synthesis-design-state">
    <header className="s04-title"><div><small>AI-designed method</small><h2>One methodological decision remains</h2></div><em className="neutral">Draft method</em></header>
    <dl className="s04-method"><div><dt>Evidence</dt><dd>Trends · Reddit · Wikipedia</dd></div><div><dt>Grain</dt><dd>asset-week</dd></div><div><dt>Construction</dt><dd>align → aggregate → normalise → combine → validate</dd></div><div><dt>Output</dt><dd>stablecoin_attention_weekly</dd></div></dl>
    <div className="s04-resolved-list"><strong>Six routine decisions resolved by AI</strong><ul><li>Canonical asset identity mapping</li><li>Daily-to-weekly aggregation</li><li>Within-source standardisation</li><li>GDELT validation-only</li><li>Unique output key</li><li>Field lineage required</li></ul></div>
    <fieldset className="s04-choice"><legend>How should the three core signals contribute?</legend>{[["equal", "Equal weighting", "Recommended · transparent and reproducible"], ["reliability", "Reliability-adjusted", "Requires a defensible reliability model"], ["custom", "Custom weights", "Researcher-defined shares"]].map(([value, title, sub]) => <label key={value} className={weighting === value ? "selected" : ""}><input type="radio" checked={weighting === value} onChange={() => setWeighting(value)} /><span><strong>{title}</strong><small>{sub}</small></span></label>)}</fieldset>
    <footer className="s04-actions"><p><small>Next</small>Compile the bounded method and run a non-registering preview.</p><button className="rd-v2-btn" onClick={() => ask("Challenge the weighting recommendation.")}>Challenge recommendation</button><button className="rd-v2-btn primary" onClick={next}>Accept &amp; test</button></footer>
  </section>;
}

function Test({ back, build, ask }) {
  return <section className="s04-card" data-testid="synthesis-test-state">
    <header className="s04-title"><div><small>Bounded preview</small><h2>Ready to build—with one documented warning</h2></div><em className="warn">1 warning</em></header>
    <div className="s04-metrics">{[["Preview rows", "3,120", "nothing registered"], ["Entities matched", "29 / 30", "1 alias unresolved"], ["Complete components", "94.8%", "3 of 3 signals"], ["Output key", "Unique", "asset_id + week"]].map(([a,b,c]) => <article key={a}><small>{a}</small><strong>{b}</strong><span>{c}</span></article>)}</div>
    <div className="s04-table"><table><thead><tr><th>Asset</th><th>Week</th><th>Trends</th><th>Reddit</th><th>Wiki</th><th>Count</th><th>Attention</th></tr></thead><tbody><tr><td>USDT</td><td>2025-W01</td><td>0.18</td><td>0.44</td><td>0.21</td><td>3</td><td>0.28</td></tr><tr><td>USDC</td><td>2025-W01</td><td>0.20</td><td>0.15</td><td>0.24</td><td>3</td><td>0.20</td></tr><tr><td>DAI</td><td>2025-W01</td><td>-0.04</td><td>0.72</td><td>0.11</td><td>3</td><td>0.26</td></tr></tbody></table></div>
    <div className="s04-results"><article><b>✓</b><strong>Five checks passed</strong><p>Coverage, key, lineage, source binding, and availability are coherent.</p></article><article className="warning"><b>!</b><strong>Component imbalance</strong><p>Reddit dominates variance for six assets.</p><button onClick={() => ask("Explain the component-imbalance warning.")}>Review warning</button></article></div>
    <footer className="s04-actions"><p><small>Write effect</small>The next action requests a durable build; approval remains required before registration.</p><button className="rd-v2-btn" onClick={back}>Return to design</button><button className="rd-v2-btn primary" onClick={build}>Accept warning &amp; request build</button></footer>
  </section>;
}

function Build({ progress, phase, fail }) {
  const phases = ["Lock revisions", "Align entities", "Construct components", "Generate output", "Verify output", "Register"];
  const active = Math.min(phases.length - 1, Math.floor(progress / 17));
  return <section className="s04-card" data-testid="synthesis-build-state"><header className="s04-title"><div><small>Durable build</small><h2>Building stablecoin attention weekly panel</h2></div><em>{progress}%</em></header><div className="s04-progress"><span style={{ width: `${progress}%` }} /></div><div className="s04-build"><ol>{phases.map((p,i) => <li key={p} className={i < active ? "done" : i === active ? "now" : ""}><b>{i < active ? "✓" : i + 1}</b><strong>{p}</strong><small>{i < active ? "Complete" : i === active ? "Running" : "Waiting"}</small></li>)}</ol><article><small>Current output</small><strong>{Math.round(13827 * Math.max(progress,18) / 100).toLocaleString()} provisional rows</strong><p>29 assets · 7 fields · 2021-W01 → 2026-W26</p><dl><div><dt>Plan</dt><dd>s04-r3</dd></div><div><dt>Source lock</dt><dd>4 revisions</dd></div><div><dt>Operation</dt><dd>{phase}</dd></div></dl></article></div><p className="s04-fixture">Fixture-backed target lifecycle; no live backend write is claimed.</p><button className="s04-fail-link" onClick={fail}>Exercise failure state</button></section>;
}

function Registered({ stale, open, refresh, ask }) {
  return <section className="s04-card" data-testid="synthesis-registered-state"><header className="s04-title"><div><small>{stale ? "Refresh available" : "Verified and registered"}</small><h2>Stablecoin attention weekly panel</h2></div><em className={stale ? "warn" : "success"}>{stale ? "Updates found" : "Query ready"}</em></header><div className="s04-metrics">{[["Rows","13,827",""],["Fields","7",""],["Assets","29",""],["Coverage","2021–2026",""]].map(([a,b,c]) => <article key={a}><small>{a}</small><strong>{b}</strong><span>{c}</span></article>)}</div><div className="s04-proof"><section><small>Verification</small><ul><li>Unique asset-week key</li><li>Complete field lineage</li><li>96.3% complete three-component rows</li><li>GDELT diagnostics recorded</li></ul></section><section><small>Registration proof</small><dl><div><dt>Dataset</dt><dd>stablecoin_attention_weekly</dd></div><div><dt>Manifest</dt><dd>mft_s04_0726</dd></div><div><dt>Spec hash</dt><dd>sha256:8a4…d19</dd></div><div><dt>Drive</dt><dd>Verified</dd></div></dl></section></div><div className="s04-use"><small>What this asset may support</small><div><article><strong>Descriptive research</strong><p>Attention trends and cross-asset cycles.</p></article><article><strong>Panel and event research</strong><p>Fixed effects and event response.</p></article></div><button onClick={() => ask("Assess the strongest empirical designs this asset supports.")}>Ask about empirical use</button></div><footer className="s04-actions"><p><small>Saved construction</small>{stale ? "Review new source revisions before refreshing." : "Duplicate, inspect, or assess freshness when source assets update."}</p><button className="rd-v2-btn" onClick={refresh}>{stale ? "Review refresh" : "Assess freshness"}</button><button className="rd-v2-btn primary" onClick={open}>Open in Library</button></footer></section>;
}

export function SynthesisPage({ datasets = [], onAskComposer, onGoTab, onOpenDataset }) {
  const [state, setState] = useState(fromUrl);
  const [intent, setIntent] = useState(INTENT);
  const [weighting, setWeighting] = useState("equal");
  const [compare, setCompare] = useState(false);
  const [progress, setProgress] = useState(state === "build" ? 24 : 0);
  const [phase, setPhase] = useState("Locking source revisions");
  const timer = useRef(null);
  const ask = prompt => onAskComposer?.({ prompt: `${prompt}\n\nSynthesis context: ${intent}\nCurrent state: ${label(state)}.`, displayText: prompt });
  useEffect(() => () => timer.current && clearInterval(timer.current), []);
  const build = () => { setState("build"); setProgress(8); clearInterval(timer.current); timer.current = setInterval(() => setProgress(p => { const n = Math.min(100, p + 8); setPhase(n < 35 ? "Locking source revisions" : n < 60 ? "Constructing components" : n < 85 ? "Generating output" : "Verifying and registering"); if (n === 100) { clearInterval(timer.current); setTimeout(() => setState("registered"), 300); } return n; }), 220); };
  return <PageShell className="rd-v2-synthesis-page" title="Synthesis" lead="Turn a research intention into a defensible, reusable research asset."><div className="s04-shell" data-testid="synthesis-studio"><aside className="s04-threads"><header><span>Active work</span><small>{THREADS.length} threads</small></header>{THREADS.map(([name, status],i) => <button key={name} className={i === 0 ? "active" : ""} onClick={() => i ? ask(`Open ${name} and summarize its state.`) : setState("explore")}><b>{i ? i + 1 : "S"}</b><span><strong>{name}</strong><small>{status}</small></span></button>)}<button className="new" onClick={() => { setState("intent"); setIntent(""); }}>＋ New synthesis</button><footer><small>Registered outputs</small><button onClick={() => onGoTab?.("library")}>Trust weekly panel</button><button onClick={() => onGoTab?.("library")}>Security event panel</button></footer></aside><main key={state} className="s04-main"><header className="s04-head"><div><small>{label(state)}</small><h1>{state === "intent" ? "New synthesis" : "Historical stablecoin attention"}</h1><p>{state === "intent" ? "Start with the research object, not a predefined pipeline." : "A durable research-construction thread shared with Ask."}</p></div><em>{state === "registered" || state === "stale" ? "Registered proof available" : state === "build" ? "Fixture-backed lifecycle" : "Nothing written yet"}</em></header><StepRail state={state}/>{state !== "intent" ? <div className="s04-brief"><span><small>Research brief</small>{intent || INTENT}</span><button onClick={() => setState("intent")}>Edit intent</button></div> : null}{state === "intent" ? <section className="s04-intent" data-testid="synthesis-intent-state"><small>Start a research construction</small><h2>What research asset do you need?</h2><p>Ask interprets the construct before any method or data operation is accepted.</p><textarea rows={7} value={intent} onChange={e => setIntent(e.target.value)} /><footer><span>Nothing will be built or registered.</span><button className="rd-v2-btn primary" disabled={!intent.trim()} onClick={() => { setState("explore"); ask(intent); }}>Review interpretation</button></footer></section> : null}{state === "explore" ? <Explore accept={() => setState("design")} compare={() => setCompare(true)} /> : null}{state === "design" ? <Design weighting={weighting} setWeighting={setWeighting} next={() => setState("test")} ask={ask} /> : null}{state === "test" ? <Test back={() => setState("design")} build={build} ask={ask} /> : null}{state === "build" ? <Build progress={progress} phase={phase} fail={() => { clearInterval(timer.current); setState("failed"); }} /> : null}{state === "failed" ? <section className="s04-card s04-failed" data-testid="synthesis-failed-state"><b>!</b><h2>Build stopped before registration</h2><p>No manifest was accepted and no Library asset was created.</p><button className="rd-v2-btn primary" onClick={build}>Retry build</button></section> : null}{state === "registered" || state === "stale" ? <Registered stale={state === "stale"} open={() => onOpenDataset?.({ dataset_id: "stablecoin_attention_weekly", name: "Stablecoin attention weekly panel", analysis_readiness: "instant" })} refresh={() => setState(state === "stale" ? "test" : "stale")} ask={ask} /> : null}</main><AskPanel state={state} ask={ask} compare={() => setCompare(true)} /></div>{compare ? <div className="s04-overlay" role="dialog" aria-modal="true"><section><header><div><small>Compare constructions</small><h2>Three materially different research objects</h2></div><button onClick={() => setCompare(false)}>×</button></header><div>{[["Recommended","Composite behavioural index","Best balance of construct clarity, coverage, and feasibility."],["Easiest","News-visibility index","Simpler, but measures editorial visibility only."],["Different object","Event-attention panel","Useful around incidents, but not a general longitudinal measure."]].map(([tag,title,copy]) => <article key={title}><em>{tag}</em><h3>{title}</h3><p>{copy}</p>{tag === "Different object" ? <button onClick={() => { setIntent("Construct an event-response panel measuring stablecoin attention around depegs and security incidents."); setCompare(false); ask("Redesign this as an event-response panel and explain the output change."); }}>Make primary</button> : null}</article>)}</div><button className="rd-v2-btn primary" onClick={() => setCompare(false)}>Keep recommended construction</button></section></div> : null}</PageShell>;
}
