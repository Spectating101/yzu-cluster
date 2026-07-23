import { RESEARCH_ACTIONS } from "@/v2/researchValue";

function IngredientRow({ item, onSelect }) {
  const state = item.missing ? "limitation" : item.proofPending ? "referenced" : "controlled";
  return (
    <button
      type="button"
      className={`rd-proxy-ingredient ${state}`}
      onClick={() => onSelect(item.missing ? "measurement_limitations" : "available_ingredients", item)}
      data-proxy-ingredient={state}
    >
      <span className="rd-proxy-ingredient-role">{item.role}</span>
      <span className="rd-proxy-ingredient-copy">
        <strong>{item.label}</strong>
        <small>{item.contribution}</small>
      </span>
      <span className="rd-proxy-ingredient-meta">
        <b>{item.grain}</b>
        <small>{item.coverage}</small>
      </span>
    </button>
  );
}

function TradeoffValue({ value }) {
  const tone = /high|strong/i.test(value) ? "strong" : /low|weak/i.test(value) ? "weak" : "neutral";
  return <span className={`rd-proxy-tradeoff ${tone}`}>{value}</span>;
}

function RecipeComparison({ recipes, onSelect }) {
  if (!recipes.length) {
    return <p className="rd-proxy-empty">Alternative proxy designs have not been generated in durable state.</p>;
  }
  return (
    <div className="rd-proxy-comparison-table" role="table" aria-label="Proxy design comparison">
      <div className="rd-proxy-comparison-head" role="row">
        <span>Proxy design</span><span>Fidelity</span><span>Coverage</span><span>Timing</span><span>Reproducibility</span><span>Main compromise</span>
      </div>
      {recipes.map((recipe) => (
        <button
          type="button"
          key={recipe.id}
          className={recipe.recommended ? "recommended" : ""}
          onClick={() => onSelect("proxy_recipes", recipe)}
          role="row"
        >
          <span><strong>{recipe.title}</strong>{recipe.recommended ? <small>Recommended</small> : null}</span>
          <TradeoffValue value={recipe.fidelity} />
          <TradeoffValue value={recipe.coverage} />
          <TradeoffValue value={recipe.timing} />
          <TradeoffValue value={recipe.reproducibility} />
          <span className="rd-proxy-compromise">{recipe.limitation}</span>
        </button>
      ))}
    </div>
  );
}

function RecipePanel({ recipe, outputContract, onSelect }) {
  if (!recipe) {
    return (
      <section className="rd-proxy-recipe rd-proxy-recipe-empty" aria-label="Recommended proxy design">
        <header><span>Recommended proxy design</span><b>Not generated</b></header>
        <h2>No structured proxy recipe is recorded</h2>
        <p>The durable thread exists, but the backend has not supplied a recommendation with evidence roles, validity tradeoffs, and alternative designs.</p>
      </section>
    );
  }

  return (
    <section className="rd-proxy-recipe" aria-label="Recommended proxy design">
      <header>
        <div><span>Recommended proxy design</span><h2>{recipe.title}</h2></div>
        <b>{recipe.supported === false ? "Unsupported" : recipe.supported === true ? "Executable" : "Design state"}</b>
      </header>
      <p className="rd-proxy-recipe-summary">{recipe.summary}</p>
      <div className="rd-proxy-recipe-flow" aria-label="Synthesis recipe">
        {recipe.steps.length ? recipe.steps.map((step, index) => (
          <button type="button" key={`${step}-${index}`} onClick={() => onSelect("synthesis_recipe", { label: step })}>
            <span>{String(index + 1).padStart(2, "0")}</span><strong>{step}</strong>
          </button>
        )) : <p className="rd-proxy-empty">Structured transformation steps have not been recorded.</p>}
      </div>
      <div className="rd-proxy-recipe-notes">
        <div>
          <span>Why this route</span>
          {recipe.whyRecommended.length ? <ul>{recipe.whyRecommended.map((item) => <li key={item}>{item}</li>)}</ul> : <p>Recommendation rationale has not been recorded.</p>}
        </div>
        <div>
          <span>Main limitation</span>
          <p>{recipe.limitation}</p>
        </div>
      </div>
      <dl className="rd-proxy-output-contract">
        <div><dt>Constructed dataset</dt><dd>{outputContract.datasetId || outputContract.label}</dd></div>
        <div><dt>Grain</dt><dd>{outputContract.grain}</dd></div>
        <div><dt>Coverage</dt><dd>{outputContract.coverage}</dd></div>
        <div><dt>Destination</dt><dd>{outputContract.destination}</dd></div>
      </dl>
    </section>
  );
}

export function SynthesisProxyCanvas({ view, onSelectArea, onAsk, onGoTab, onOpenDataset }) {
  const controlled = view.ingredients.filter((item) => !item.missing);
  const hasIdealLimitations = view.idealEvidence.length > 0;
  const registered = ["registered", "query_ready"].includes(view.mode);

  const generateRecipes = () => onAsk(
    "Generate the strongest defensible proxy dataset designs from controlled evidence. Return one recommendation and explicit alternatives with conceptual fidelity, coverage, temporal precision, reproducibility, leakage risk, assumptions, and output contracts. Do not claim executable support that the runtime has not proven.",
    "proxy_recipes",
  );

  const challengeRecipe = () => onAsk(
    "Challenge the recommended proxy design. Identify construct-validity threats, leakage risk, temporal assumptions, coverage compromises, and a stronger alternative when one exists. Return a structured proposal rather than changing accepted state silently.",
    "proxy_recipes",
  );

  const investigateAdditionalEvidence = () => {
    const limitation = view.idealEvidence[0];
    onAsk(
      `Assess whether additional evidence would materially improve the proxy. Preserve the current proxy design and treat acquisition as an escalation path, not the default. Measurement limitation: ${limitation?.label || "No exact limitation selected"}.`,
      "measurement_limitations",
    );
    onGoTab?.("browse");
  };

  return (
    <section className="rd-proxy-canvas" data-testid="synthesis-proxy-design" aria-label="Proxy dataset design">
      <header className="rd-proxy-target">
        <div>
          <small>Proxy dataset design</small>
          <h1>{view.target.label}</h1>
          <p>{view.target.description}</p>
        </div>
        <span>{view.target.measurementStatus}</span>
        <dl>
          <div><dt>Target grain</dt><dd>{view.target.grain}</dd></div>
          <div><dt>Population</dt><dd>{view.target.population}</dd></div>
          <div><dt>Period</dt><dd>{view.target.period}</dd></div>
        </dl>
      </header>

      <div className="rd-proxy-core">
        <section className="rd-proxy-ingredients" aria-label="Available source datasets">
          <header><div><span>Available source datasets</span><strong>{controlled.length} controlled ingredients</strong></div></header>
          <div className="rd-proxy-ingredient-list">
            {controlled.length ? controlled.map((item) => (
              <IngredientRow key={item.id} item={item} onSelect={onSelectArea} />
            )) : <p className="rd-proxy-empty">No controlled source dataset is mapped to this design.</p>}
          </div>
          <aside className="rd-proxy-limitation" aria-label="Measurement limitations">
            <div><span>Measurement limitations</span><strong>{hasIdealLimitations ? `${view.idealEvidence.length} recorded` : "Not recorded"}</strong></div>
            {hasIdealLimitations ? view.idealEvidence.map((item) => (
              <button type="button" key={item.id} onClick={() => onSelectArea("measurement_limitations", item)}>
                <strong>{item.label}</strong><small>{item.reason}</small>
              </button>
            )) : <p>No ideal-measure limitation is recorded. Construct completeness is not implied.</p>}
          </aside>
        </section>

        <RecipePanel recipe={view.primaryRecipe} outputContract={view.outputContract} onSelect={onSelectArea} />
      </div>

      <section className="rd-proxy-alternatives" aria-label="Candidate proxy designs">
        <header>
          <div><span>Candidate proxy designs</span><strong>{view.recipes.length ? `${view.recipes.length} designs` : "Not generated"}</strong></div>
          <button type="button" onClick={generateRecipes}>Generate or refresh alternatives</button>
        </header>
        <RecipeComparison recipes={view.recipes} onSelect={onSelectArea} />
      </section>

      <footer className="rd-proxy-next" data-decision-type={view.nextDecision.type}>
        <div><small>Next synthesis decision</small><h2>{view.nextDecision.title}</h2><p>{view.nextDecision.detail}</p></div>
        <div>
          {hasIdealLimitations ? <button type="button" className="rd-v2-btn" onClick={investigateAdditionalEvidence}>Find additional evidence</button> : null}
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
            {view.primaryRecipe ? "Challenge proxy design" : "Generate proxy recipes"}
          </button>
        </div>
      </footer>
    </section>
  );
}
