export const isAnalysisNumber = (value) => typeof value === "number" && Number.isFinite(value);

export function formatAnalysisNumber(value) {
  if (!isAnalysisNumber(value)) return "—";
  const rounded = value !== 0 && Math.abs(value) < 0.001 ? Number(value.toPrecision(3)).toString() : value.toFixed(3);
  return rounded === "-0.000" ? "0.000" : rounded.replace("-", "−");
}

export function formatAnalysisP(value) {
  if (!isAnalysisNumber(value)) return "—";
  return value < 0.001 ? "< 0.001" : formatAnalysisNumber(value);
}

export function formatAnalysisCount(value) {
  return isAnalysisNumber(value) ? value.toLocaleString("en-US") : "—";
}

export function analysisTypeLabel(type) {
  return ({ ols: "Linear regression (OLS)", panel_fe: "Panel regression with fixed effects", correlation: "Correlation", event_study: "Event study" })[type] || "Analysis";
}

export function covarianceLabel(analysis) {
  const spec = analysis.spec || {};
  const covariance = analysis.covariance || spec.covariance;
  if (covariance === "cluster") return spec.cluster ? `Clustered by ${spec.cluster}` : "Clustered";
  if (covariance === "cluster_entity") return spec.entity ? `Clustered by ${spec.entity}` : "Clustered by entity";
  if (covariance === "HC1") return "Robust (HC1)";
  if (covariance === "nonrobust") return "Classical";
  return "";
}

export function analysisDescription(analysis) {
  const spec = analysis.spec || {};
  if (analysis.type === "correlation") return `${(analysis.method || spec.method) === "spearman" ? "Spearman" : "Pearson"} · ${(spec.columns || []).join(", ")}`;
  if (analysis.type === "event_study") {
    const benchmark = analysis.benchmark || spec.benchmark;
    return [`Return: ${spec.return || "Not documented"}`, benchmark === "market" ? `Market benchmark: ${spec.market_return || "Not documented"}` : "Mean return benchmark", spec.event_window ? `Event window: ${spec.event_window.join(" to ")}` : "", spec.estimation_window ? `Estimation window: ${spec.estimation_window.join(" to ")}` : ""].filter(Boolean).join(" · ");
  }
  return [`Outcome: ${spec.outcome || "Not documented"}`, `Predictors: ${(spec.predictors || []).join(", ") || "Not documented"}`].join(" · ");
}

export function analysisRows(rows, chart) {
  const values = Array.isArray(chart?.data?.values) ? chart.data.values : [];
  return Array.isArray(rows) && rows.length >= values.length && rows.length ? rows : values;
}

export function zeroDomain(values) {
  const finite = values.filter(isAnalysisNumber);
  const low = Math.min(0, ...finite);
  const high = Math.max(0, ...finite);
  const padding = (high - low || 1) * 0.08;
  return [low - padding, high + padding];
}

export function linearScale(domain, range) {
  const span = domain[1] - domain[0];
  return (value) => span ? range[0] + (value - domain[0]) / span * (range[1] - range[0]) : (range[0] + range[1]) / 2;
}

export function regressionGeometry(rows) {
  const plotted = rows.filter((row) => row.term !== "const" && isAnalysisNumber(row.coef));
  const domain = zeroDomain(plotted.flatMap((row) => [row.coef, row.ci_low, row.ci_high]));
  const x = linearScale(domain, [160, 580]);
  const height = Math.max(110, plotted.length * 32 + 58);
  return { domain, height, zero: x(0), points: plotted.map((row, index) => ({ row, x: x(row.coef), y: 24 + index * 32, low: isAnalysisNumber(row.ci_low) ? x(row.ci_low) : null, high: isAnalysisNumber(row.ci_high) ? x(row.ci_high) : null })) };
}

export function correlationMatrix(rows, columns = []) {
  const variables = [...new Set([...columns, ...rows.flatMap((row) => [row.var1, row.var2])])].filter(Boolean);
  const cells = new Map(rows.map((row) => [JSON.stringify([row.var1, row.var2]), row]));
  return { variables, cell: (var1, var2) => cells.get(JSON.stringify([var1, var2])) };
}

export function correlationColor(value) {
  if (!isAnalysisNumber(value)) return "var(--rd-canvas)";
  const clamped = Math.max(-1, Math.min(1, value));
  const token = clamped < 0 ? "--rd-fail-fg" : "--rd-link";
  return `color-mix(in srgb, var(${token}) ${Math.abs(clamped) * 65}%, var(--rd-surface))`;
}

export function eventGeometry(rows) {
  const plotted = rows.filter((row) => isAnalysisNumber(row.rel_day)).sort((a, b) => a.rel_day - b.rel_day);
  const xDomain = zeroDomain(plotted.map((row) => row.rel_day));
  const yDomain = zeroDomain(plotted.flatMap((row) => [row.car, row.ci_low, row.ci_high]));
  const x = linearScale(xDomain, [70, 580]);
  const y = linearScale(yDomain, [240, 24]);
  const points = plotted.map((row) => ({ row, x: x(row.rel_day), y: isAnalysisNumber(row.car) ? y(row.car) : null, low: isAnalysisNumber(row.ci_low) ? y(row.ci_low) : null, high: isAnalysisNumber(row.ci_high) ? y(row.ci_high) : null }));
  const segments = (predicate) => {
    const groups = [[]];
    for (const point of points) {
      if (predicate(point)) groups[groups.length - 1].push(point);
      else if (groups[groups.length - 1].length) groups.push([]);
    }
    return groups.filter((group) => group.length);
  };
  return { xDomain, yDomain, zeroX: x(0), zeroY: y(0), points, lines: segments((point) => point.y !== null).map((group) => group.map((point) => `${point.x},${point.y}`).join(" ")), bands: segments((point) => point.low !== null && point.high !== null).map((group) => [...group.map((point) => `${point.x},${point.high}`), ...group.slice().reverse().map((point) => `${point.x},${point.low}`)].join(" ")) };
}
