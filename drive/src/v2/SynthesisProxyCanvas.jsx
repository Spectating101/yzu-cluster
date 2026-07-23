import { RESEARCH_ACTIONS } from "@/v2/researchValue";

function IngredientCard({ item, onSelect }) {
  const state = item.proofPending ? "referenced" : "controlled";
  return (
    <button
      type="button"
      className={`rd-proxy-ingredient ${state}`}
      onClick={() => onSelect("available_ingredients", item)}
      data-proxy-ingredient={state}
      title={item.contribution}
      aria-label={`${item.role}: ${item.label}. ${item.contribution}`}
    >
      <span className="rd-proxy-ingredient-role">{item.role}</span>
      <strong>{item.label}</strong>
      <small>{item.grain}</small>
    </button>
  );
}

function TradeoffValue({ label, value }) {
  const tone = /high|strong/i.test(value) ? "strong" : /low|weak/i.test(value) ? "weak" : "neutral";
  return (
    <span className={`rd-proxy-tradeoff ${tone}`} title={`${label}: ${value}`}>
      <small>{label}</small><b>{value}</b>
    </span>
  );
}

function RecipeMetrics({ recipe }) {
  return (
    <div className="rd-proxy-recipe-metrics" aria-label="Proxy validity profile">
      <TradeoffValue label="Fidelity" value={recipe.fidelity} />
      <TradeoffValue label="Coverage" value={recipe.coverage} />
      <TradeoffValue label="Timing" value={recipe.timing} />
      <TradeoffValue label="Repeatable" value={recipe.reproducibility} />
    </div>
  );
}

function compactStep(step, index) {
  const source = String(step || "").trim();
  if (/anchor|snapshot/i.test(source)) return "Anchor";
  if (/resolve|conflict|conservative/i.test(source)) return "Resolve conflicts";
  if (/extract|event|signal/i.test(source)) return "Extract events";
  if (/emit|output|panel|field/i.test(source)) return "Emit panel";
  const words = source.split(/\s+/).filter(Boolean);
  return words.slice(0, 2).join(" ") || `Transform ${index + 1}`;
}

function AlternativeCards({ alternatives, onSelect }) {
  if (!alternatives.length) {
    return <p className="rd-proxy-empty">No alternative recipes generated.</p>;
  }
  return (
    <div className="rd-proxy-alternative-strip" aria-label="Alternative proxy designs">
      {alternatives.map((recipe) => (
        <button
          type="button"
          key={recipe.id}
          onClick={() => onSelect("proxy_recipes", recipe)}
          title={recipe.limitation}
          aria-label={`${recipe.title}. Fidelity ${recipe.fidelity}; coverage ${recipe.coverage}; timing ${recipe.timing}. ${recipe.limitation}`}
        >
          <strong>{recipe.title}</strong>
          <span className="rd-proxy-alternative-metrics">
            <b>F {recipe.fidelity}</b>
            <b>C {recipe.coverage}</b>
            <b>T {recipe.timing}</b>
          </span>
        </button>
      ))}
    </div>
  );
}

function OutputNode({ outputContract, onSelect }) {
  const outputName = outputContract.label || outputContract.datasetId;
  return (
    <button
      type="button"
      className="rd-proxy-output-node"
      onClick={() => onSelect("output_contract", outputContract)}
      title={outputContract.datasetId || outputName}
      aria-label={`Constructed dataset ${outputContract.datasetId || outputName}, ${outputContract.grain}, ${outputContract.coverage}`}
    >
      <small>Constructed output</small>
      <strong>{outputName}</strong>
      <span>{outputContract.grain} · {outputContract.coverage}</span>
    </button>
  );
}

function RecipePanel({ recipe, outputContract, onSelect }) {
  if (!recipe) {
    return (
      <section className="rd-proxy-recipe rd-proxy-recipe-empty" aria-label="Recommended proxy design">
        <header><span>Recommended proxy</span><b>Not generated</b></header>
        <button type="button" onClick={() => onSelect("proxy_recipes", {})}>Generate a defensible recipe</button>
      </section>
    );
  }

  return (
    <section className="rd-proxy-recipe" aria-label="Recommended proxy design">
      <header>
        <div><span>Recommended proxy</span><h2>{recipe.title}</h2></div>
        <b>{recipe.supported === false ? "Unsupported" : recipe.supported === true ? "Executable" : "Design"}</b>
      </header>

      <div className="rd-proxy-instrument">
        <div className="rd-proxy-recipe-flow" aria-label="Synthesis recipe">
          {recipe.steps.length ? recipe.steps.map((step, index) => (
            <button
              type="button"
              key={`${step}-${index}`}
              onClick={() => onSelect("synthesis_recipe", { label: step, compactLabel: compactStep(step, index), index })}
              title={step}
              aria-label={step}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{compactStep(step, index)}</strong>
            </button>
          )) : <p className="rd-proxy-empty">No transformation steps recorded.</p>}
        </div>
        <span className="rd-proxy-flow-arrow" aria-hidden>→</span>
        <OutputNode outputContract={outputContract} onSelect={onSelect} />
      </div>

      <RecipeMetrics recipe={recipe} />
    </section>
  );
}

function selectionCopy(selection) {
  const area = selection?.area || "";
  const item = selection?.item || {};
  if (area === "available_ingredients") {
    return { eyebrow: item.role || "Source dataset", title: item.label || "Selected ingredient", meta: `${item.grain || "Grain unknown"} · ${item.coverage || "Coverage unknown"}` };
  }
  if (area === "synthesis_recipe") {
    return { eyebrow: `Transformation ${Number(item.index || 0) + 1}`, title: item.compactLabel || item.label || "Selected transformation", meta: item.label || "Transformation detail not recorded" };
  }
  if (area === "proxy_recipes") {
    return { eyebrow: "Candidate recipe", title: item.title || "Proxy recipe", meta: `Fidelity ${item.fidelity || "—"} · Coverage ${item.coverage || "—"} · Timing ${item.timing || "—"}` };
  }
  if (area === "measurement_limitations") {
    return { eyebrow: "Measurement limitation", title: item.label || "Direct measure unavailable", meta: item.reason || "No limitation detail recorded" };
  }
  if (area === "output_contract") {
    return { eyebrow: "Constructed output", title: item.label || item.datasetId || "Output dataset", meta: `${item.grain || "Grain unknown"} · ${item.coverage || "Coverage unknown"}` };
  }
  return null;
}

function SelectionActions({ selection, view, onAsk, onFindEvidence, onOpenDataset }) {
  const copy = selectionCopy(selection);
  if (!copy) {
    return (
      <div className="rd-proxy-selection rd-proxy-selection-idle" data-testid="synthesis-selection-actions">
        <span>Select a source, transformation, recipe, limitation, or output to inspect and act on it.</span>
      </div>
    );
  }
  const registered = ["registered", "query_ready"].includes(view.mode);
  const area = selection.area;
  const item = selection.item || {};
  const discuss = () => onAsk(
    `Inspect the selected ${area.replace(/_/g, " ")}: ${copy.title}. Explain its exact role, assumptions, backend authority, and available next actions without changing durable state silently.`,
    area,
  );

  return (
    <aside className="rd-proxy-selection" data-testid="synthesis-selection-actions" aria-label="Selected synthesis object">
      <div>
        <small>{copy.eyebrow}</small>
        <strong>{copy.title}</strong>
        <span title={copy.meta}>{copy.meta}</span>
      </div>
      <div>
        {area === "measurement_limitations" ? <button type="button" className="rd-v2-btn" onClick={() => onFindEvidence?.(item)}>Route to Discover</button> : null}
        {area === "output_contract" && registered && view.outputContract.datasetId ? (
          <button
            type="button"
            className="rd-v2-btn"
            onClick={() => onOpenDataset?.({ dataset_id: view.outputContract.datasetId, name: view.outputContract.label, analysis_readiness: view.mode === "query_ready" ? "instant" : "registered" })}
          >
            {RESEARCH_ACTIONS.inspectEvidence}
          </button>
        ) : null}
        <button type="button" className="rd-v2-btn primary" onClick={discuss}>Inspect in Composer</button>
      </div>
    </aside>
  );
}

export function SynthesisProxyCanvas({ view, selection, onSelectArea, onAsk, onFindEvidence, onOpenDataset }) {
  const controlled = view.ingredients.filter((item) => !item.missing);
  const hasIdealLimitations = view.idealEvidence.length > 0;
  const registered = ["registered", "query_ready"].includes(view.mode);
  const primaryLimitation = view.idealEvidence[0];

  const generateRecipes = () => onAsk(
    "Generate the strongest defensible proxy dataset designs from controlled evidence. Return one recommendation and explicit alternatives with conceptual fidelity, coverage, temporal precision, reproducibility, leakage risk, assumptions, and output contracts. Do not claim executable support that the runtime has not proven.",
    "proxy_recipes",
  );

  const challengeRecipe = () => onAsk(
    "Challenge the recommended proxy design. Identify construct-validity threats, leakage risk, temporal assumptions, coverage compromises, and a stronger alternative when one exists. Return a structured proposal rather than changing accepted state silently.",
    "proxy_recipes",
  );

  return (
    <section className="rd-proxy-canvas rd-proxy-instrument-view" data-testid="synthesis-proxy-design" aria-label="Proxy dataset design">
      <header className="rd-proxy-target">
        <div>
          <small>Target construct</small>
          <h1>{view.target.label}</h1>
        </div>
        <span title={view.target.measurementStatus}>{hasIdealLimitations ? "Direct measure incomplete" : "No limitation recorded"}</span>
        <dl>
          <div><dt>Grain</dt><dd>{view.target.grain}</dd></div>
          <div><dt>Population</dt><dd>{view.target.population}</dd></div>
          <div><dt>Period</dt><dd>{view.target.period}</dd></div>
        </dl>
      </header>

      <div className="rd-proxy-core">
        <section className="rd-proxy-ingredients" aria-label="Available source datasets">
          <header><div><span>Controlled ingredients</span><strong>{controlled.length}</strong></div></header>
          <div className="rd-proxy-ingredient-list">
            {controlled.length ? controlled.map((item) => (
              <IngredientCard key={item.id} item={item} onSelect={onSelectArea} />
            )) : <p className="rd-proxy-empty">No controlled datasets mapped.</p>}
          </div>
          <button
            type="button"
            className="rd-proxy-limitation"
            onClick={() => onSelectArea("measurement_limitations", primaryLimitation)}
            title={primaryLimitation?.reason || "No direct-measure limitation recorded"}
          >
            <span>Direct measure unavailable</span>
            <strong>{primaryLimitation?.label || "Not recorded"}</strong>
          </button>
        </section>

        <RecipePanel recipe={view.primaryRecipe} outputContract={view.outputContract} onSelect={onSelectArea} />
      </div>

      <SelectionActions selection={selection} view={view} onAsk={onAsk} onFindEvidence={onFindEvidence} onOpenDataset={onOpenDataset} />

      <section className="rd-proxy-alternatives" aria-label="Candidate proxy designs">
        <header>
          <div><span>Alternative recipes</span><strong>{view.alternatives.length || 0}</strong></div>
          <button type="button" onClick={generateRecipes}>Refresh</button>
        </header>
        <AlternativeCards alternatives={view.alternatives} onSelect={onSelectArea} />
      </section>

      <footer className="rd-proxy-next" data-decision-type={view.nextDecision.type}>
        <div><small>Decision</small><h2>{view.nextDecision.title}</h2></div>
        <div>
          {hasIdealLimitations ? <button type="button" className="rd-v2-btn" onClick={() => onFindEvidence?.(primaryLimitation)}>Find additional evidence</button> : null}
          {registered && view.outputContract.datasetId ? (
            <button
              type="button"
              className="rd-v2-btn"
              onClick={() => onOpenDataset?.({ dataset_id: view.outputContract.datasetId, name: view.outputContract.label, analysis_readiness: view.mode === "query_ready" ? "instant" : "registered" })}
            >
              {RESEARCH_ACTIONS.inspectEvidence}
            </button>
          ) : null}
          <button type="button" className="rd-v2-btn primary" onClick={view.primaryRecipe ? challengeRecipe : generateRecipes}>
            {view.primaryRecipe ? "Challenge in Composer" : "Generate in Composer"}
          </button>
        </div>
      </footer>
    </section>
  );
}
