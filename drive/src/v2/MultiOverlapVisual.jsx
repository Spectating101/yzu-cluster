import "./synthesis-multi-overlap.css";

function n(value) {
  return Number(value || 0).toLocaleString();
}

function pct(value) {
  const number = Number(value || 0);
  return `${Number(number.toFixed(number < 10 ? 1 : 0))}%`;
}

function shortLabel(value, fallback) {
  const text = String(value || fallback || "").trim();
  if (text.length <= 34) return text;
  return `${text.slice(0, 31).trimEnd()}…`;
}

function regionMap(overlap) {
  return new Map((overlap?.intersections || []).map((row) => [Number(row.mask), row]));
}

function ThreeSetVenn({ overlap }) {
  const sources = overlap.sources || [];
  const regions = regionMap(overlap);
  const value = (mask) => n(regions.get(mask)?.count || 0);
  const label = (index) => shortLabel(sources[index]?.label || sources[index]?.dataset_id, `Source ${index + 1}`);

  return (
    <div className="s04-multi-venn-body">
      <svg viewBox="0 0 520 330" role="img" aria-label={`${n(overlap.all_shared_distinct)} keys are present in all three measured inputs`}>
        <g><title>{sources[0]?.label || sources[0]?.dataset_id}</title><circle className="set-a" cx="205" cy="125" r="108" /></g>
        <g><title>{sources[1]?.label || sources[1]?.dataset_id}</title><circle className="set-b" cx="315" cy="125" r="108" /></g>
        <g><title>{sources[2]?.label || sources[2]?.dataset_id}</title><circle className="set-c" cx="260" cy="222" r="108" /></g>

        <text className="source-label a" x="116" y="31">A</text>
        <text className="source-label b" x="404" y="31">B</text>
        <text className="source-label c" x="260" y="324">C</text>

        <text className="region-count" x="155" y="112">{value(1)}</text>
        <text className="region-count" x="365" y="112">{value(2)}</text>
        <text className="region-count" x="260" y="270">{value(4)}</text>
        <text className="region-count pair" x="260" y="78">{value(3)}</text>
        <text className="region-count pair" x="205" y="202">{value(5)}</text>
        <text className="region-count pair" x="315" y="202">{value(6)}</text>
        <text className="region-count all" x="260" y="151">{value(7)}</text>
        <text className="region-note all" x="260" y="169">all three</text>
      </svg>
      <div className="s04-multi-source-legend" aria-label="Measured sources">
        {[0, 1, 2].map((index) => (
          <span key={sources[index]?.dataset_id || index} title={sources[index]?.label || sources[index]?.dataset_id || ""}>
            <b>{String.fromCharCode(65 + index)}</b>
            <em>{label(index)}</em>
            <strong>{n(sources[index]?.distinct)} keys</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function UpSet({ overlap }) {
  const sources = overlap.sources || [];
  const rows = [...(overlap.intersections || [])]
    .filter((row) => Number(row.count) > 0)
    .sort((a, b) => Number(b.count) - Number(a.count))
    .slice(0, 12);
  const max = Math.max(...rows.map((row) => Number(row.count || 0)), 1);
  const omitted = Math.max((overlap.intersections || []).filter((row) => Number(row.count) > 0).length - rows.length, 0);

  return (
    <div className="s04-upset" data-testid="synthesis-upset-visual">
      <div className="s04-upset-legend" aria-label="Measured sources">
        {sources.map((source, index) => (
          <span key={source.dataset_id || index} title={source.label || source.dataset_id || ""}>
            <b>{String.fromCharCode(65 + index)}</b>
            <em>{shortLabel(source.label || source.dataset_id, `Source ${index + 1}`)}</em>
            <strong>{n(source.distinct)}</strong>
          </span>
        ))}
      </div>

      <div className="s04-upset-table" role="img" aria-label={`${sources.length}-source intersection distribution`}>
        {rows.map((row) => {
          const members = new Set(row.source_indexes || []);
          return (
            <div className="s04-upset-row" key={row.mask}>
              <span className="matrix" aria-label={(row.dataset_ids || []).join(", ")}>
                {sources.map((source, index) => (
                  <i key={source.dataset_id || index} className={members.has(index) ? "on" : ""} />
                ))}
              </span>
              <span className="bar"><b style={{ width: `${Math.max(2, (Number(row.count || 0) / max) * 100)}%` }} /></span>
              <strong>{n(row.count)}</strong>
              <small>{pct(row.percent_of_union)} union</small>
            </div>
          );
        })}
      </div>
      {omitted ? <p>{omitted} smaller exclusive intersection{omitted === 1 ? "" : "s"} omitted from this view.</p> : null}
    </div>
  );
}

export function MultiOverlapVisual({ overlap }) {
  const sourceCount = Number(overlap?.source_count || overlap?.sources?.length || 0);
  if (!overlap?.applicable || sourceCount < 3) return null;
  const bounded = Boolean(overlap.bounded);

  return (
    <figure className="s04-viz s04-viz-multi-overlap" data-testid="synthesis-multi-overlap-visual">
      <header>
        <div>
          <small>{bounded ? "Bounded overlap sample" : "Measured multi-source overlap"}</small>
          <strong>{n(overlap.all_shared_distinct)} keys survive across all {sourceCount} measured inputs</strong>
        </div>
        <span>{n(overlap.union_distinct)} union · {overlap.key_parts?.join(" + ") || overlap.key}</span>
      </header>

      {sourceCount === 3 ? <ThreeSetVenn overlap={overlap} /> : <UpSet overlap={overlap} />}

      <figcaption>
        {bounded
          ? `At least one source reached the ${n(overlap.row_cap_per_source)}-row read cap. Intersections are exact for the measured window, not a full-population claim.`
          : "Exclusive intersection counts are measured directly from the resolved key bytes; higher-order overlap is not inferred from pairwise rates."}
      </figcaption>
    </figure>
  );
}

export default MultiOverlapVisual;
