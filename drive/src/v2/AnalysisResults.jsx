import React from "react";
import { REGRESSION_TYPES, analysisDescription, analysisRows, analysisTypeLabel, coefficientScale, isBinaryModel, correlationColor, correlationMatrix, covarianceLabel, eventGeometry, formatAnalysisCount, formatAnalysisNumber as number, formatAnalysisP as pValue, regressionGeometry } from "./analysisResults.js";

const chartLabel = (label) => label.length > 22 ? `${label.slice(0, 21)}…` : label;
const ci = (row) => `[${number(row.ci_low)}, ${number(row.ci_high)}]`;

function RegressionChart({ rows, label }) {
  const geometry = regressionGeometry(rows);
  if (!geometry.points.length) return null;
  return (
    <svg className="rd-analysis-chart" viewBox={`0 0 620 ${geometry.height}`} role="img" aria-label={`${label}: coefficient estimates and 95% confidence intervals, excluding the intercept. Dashed line marks zero.`}>
      <line className="rd-analysis-reference" x1={geometry.zero} x2={geometry.zero} y1="8" y2={geometry.height - 32} />
      {geometry.points.map(({ row, x, y, low, high }) => (
        <g key={row.term}>
          <title>{`${row.term}: ${number(row.coef)}, 95% CI ${ci(row)}`}</title>
          <text x="150" y={y + 4} textAnchor="end">{chartLabel(String(row.term))}</text>
          {low !== null && high !== null ? <g className="rd-analysis-whisker"><line x1={low} x2={high} y1={y} y2={y} /><line x1={low} x2={low} y1={y - 5} y2={y + 5} /><line x1={high} x2={high} y1={y - 5} y2={y + 5} /></g> : null}
          <circle className="rd-analysis-point" cx={x} cy={y} r="4" />
        </g>
      ))}
      {geometry.zero - 160 > 48 ? <text x="160" y={geometry.height - 12}>{number(geometry.domain[0])}</text> : null}
      <text x={geometry.zero} y={geometry.height - 12} textAnchor="middle">0</text>
      {580 - geometry.zero > 48 ? <text x="580" y={geometry.height - 12} textAnchor="end">{number(geometry.domain[1])}</text> : null}
    </svg>
  );
}

function CorrelationChart({ matrix, label }) {
  const size = Math.max(54, Math.min(90, 420 / matrix.variables.length));
  const width = 150 + size * matrix.variables.length;
  const height = 180 + size * matrix.variables.length;
  return (
    <svg className="rd-analysis-chart" style={{ minWidth: width }} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}: correlation heatmap from −1 to 1. Shading shows sign and strength; values are printed in each cell.`}>
      {matrix.variables.map((variable, i) => (
        <g key={variable}>
          <title>{variable}</title>
          <text transform={`translate(${130 + (i + 0.5) * size}, 132) rotate(-45)`}>{chartLabel(variable)}</text>
          <text x="120" y={150 + (i + 0.5) * size} textAnchor="end">{chartLabel(variable)}</text>
        </g>
      ))}
      {matrix.variables.flatMap((var1, i) => matrix.variables.map((var2, j) => {
        const row = matrix.cell(var1, var2);
        return <g key={`${i}-${j}`}><title>{`${var1} × ${var2}: r ${number(row?.r)}, n ${formatAnalysisCount(row?.n)}`}</title><rect x={130 + j * size} y={140 + i * size} width={size} height={size} fill={correlationColor(row?.r)} /><text x={130 + (j + 0.5) * size} y={144 + (i + 0.5) * size} textAnchor="middle">{number(row?.r)}</text></g>;
      }))}
      <text x="130" y={height - 8}>−1</text><text x={width - 10} y={height - 8} textAnchor="end">1</text><text x={(130 + width) / 2} y={height - 8} textAnchor="middle">Correlation scale: −1 to 1</text>
    </svg>
  );
}

function EventChart({ rows, label }) {
  const geometry = eventGeometry(rows);
  if (!geometry.lines.length) return null;
  return (
    <svg className="rd-analysis-chart" viewBox="0 0 620 290" role="img" aria-label={`${label}: cumulative abnormal returns with a 95% confidence band. Reference lines mark zero return and event day 0.`}>
      {geometry.bands.map((points, index) => <polygon key={index} className="rd-analysis-band" points={points} />)}
      <line className="rd-analysis-reference" x1="70" x2="580" y1={geometry.zeroY} y2={geometry.zeroY} />
      <line className="rd-analysis-reference" x1={geometry.zeroX} x2={geometry.zeroX} y1="24" y2="240" />
      {geometry.lines.map((points, index) => <polyline key={index} className="rd-analysis-whisker" fill="none" points={points} />)}
      {geometry.points.filter((point) => point.y !== null).map(({ row, x, y }) => <circle key={row.rel_day} className="rd-analysis-point" cx={x} cy={y} r="3"><title>{`Day ${row.rel_day}: CAR ${number(row.car)}, 95% CI ${ci(row)}, ${formatAnalysisCount(row.n)} events`}</title></circle>)}
      <text x="60" y="28" textAnchor="end">{number(geometry.yDomain[1])}</text><text x="60" y="244" textAnchor="end">{number(geometry.yDomain[0])}</text>
      <text x="70" y="264">{formatAnalysisCount(geometry.points[0]?.row.rel_day)}</text><text x={geometry.zeroX} y="264" textAnchor="middle">0</text><text x="580" y="264" textAnchor="end">{formatAnalysisCount(geometry.points.at(-1)?.row.rel_day)}</text>
      <text x="325" y="285" textAnchor="middle">Day relative to event</text>
    </svg>
  );
}

function FitStats({ analysis }) {
  const binary = isBinaryModel(analysis);
  const stats = binary ? [
    ["Pseudo R² (McFadden)", number(analysis.pseudo_r2)],
    ["Log likelihood", number(analysis.llf)],
    ["LR χ²", number(analysis.LR)],
    ["LR p", pValue(analysis.LR_p)],
    ["Converged", analysis.converged === false ? "No" : analysis.converged === true ? "Yes" : "—"],
    ["Clusters", formatAnalysisCount(analysis.clusters)],
  ] : [
    ["R²", number(analysis.r2)],
    ["Adjusted R²", number(analysis.adj_r2)],
    ...(analysis.within_r2 !== undefined ? [["Within R²", number(analysis.within_r2)]] : []),
    ["F", number(analysis.F)],
    ["F p", pValue(analysis.F_p)],
    ["Residual df", formatAnalysisCount(analysis.df_resid)],
    ["Clusters", formatAnalysisCount(analysis.clusters)],
  ];
  return (
    <dl className="rd-analysis-fit">
      {stats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
  );
}

function MarginalEffectsTable({ effects }) {
  if (!effects?.length) return null;
  return (
    <table className="rd-analysis-table" aria-label="Average marginal effects">
      <thead>
        <tr>{["Term", "Average marginal effect", "Std. error"].map((heading) => <th scope="col" key={heading}>{heading}</th>)}</tr>
      </thead>
      <tbody>
        {effects.map((row) => <tr key={row.term}><th scope="row">{row.term}</th><td>{number(row.coef)}</td><td>{number(row.se)}</td></tr>)}
      </tbody>
    </table>
  );
}

function FirstStageTable({ stages }) {
  if (!stages?.length) return null;
  return (
    <table className="rd-analysis-table" aria-label="First-stage diagnostics">
      <thead>
        <tr>{["Endogenous regressor", "First-stage F", "p", "First-stage R²"].map((heading) => <th scope="col" key={heading}>{heading}</th>)}</tr>
      </thead>
      <tbody>
        {stages.map((row) => <tr key={row.term}><th scope="row">{row.term}</th><td>{number(row.F)}</td><td>{pValue(row.F_p)}</td><td>{number(row.r2)}</td></tr>)}
      </tbody>
    </table>
  );
}

function RegressionTable({ rows, statistic = "t", highlight = "" }) {
  return (
    <table className="rd-analysis-table" aria-label="Regression results">
      <thead>
        <tr>{["Term", "Estimate", "Std. error", statistic, "p", "95% CI"].map((heading) => <th scope="col" key={heading}>{heading}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index} className={highlight && row.term === highlight ? "is-highlighted" : undefined}>
            <th scope="row">{highlight && row.term === highlight ? "Treatment effect (treated × post)" : row.term}</th>
            <td>{number(row.coef)}</td>
            <td>{number(row.se)}</td>
            <td>{number(row.t)}</td>
            <td>{pValue(row.p)}</td>
            <td>{ci(row)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CorrelationTable({ matrix }) {
  return (
    <table className="rd-analysis-table" aria-label="Correlation results">
      <thead>
        <tr><th scope="col">Variable</th>{matrix.variables.map((variable) => <th scope="col" key={variable}>{variable}</th>)}</tr>
      </thead>
      <tbody>
        {matrix.variables.map((var1) => (
          <tr key={var1}>
            <th scope="row">{var1}</th>
            {matrix.variables.map((var2) => {
              const row = matrix.cell(var1, var2);
              return <td key={var2} title={`n = ${formatAnalysisCount(row?.n)}`}>{number(row?.r)}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EventTable({ rows }) {
  return (
    <table className="rd-analysis-table" aria-label="Event study results">
      <thead>
        <tr>{["Day relative to event", "CAR", "95% CI", "Events"].map((heading) => <th scope="col" key={heading}>{heading}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            <th scope="row" className="rd-analysis-numeric">{formatAnalysisCount(row.rel_day)}</th>
            <td>{number(row.car)}</td>
            <td>{ci(row)}</td>
            <td>{formatAnalysisCount(row.n)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AnalysisResults({ analysis, rows, chart }) {
  if (!analysis) return null;
  const values = analysisRows(rows, chart);
  const regression = REGRESSION_TYPES.has(analysis.type);
  const scale = coefficientScale(analysis);
  const correlation = analysis.type === "correlation";
  const label = analysisTypeLabel(analysis.type);
  const covariance = covarianceLabel(analysis);
  const matrix = correlation ? correlationMatrix(values, analysis.spec?.columns) : null;
  const sampleLabel = analysis.sample_only === true ? analysis.label || "sample only — not the final estimate" : "";
  const warnings = (analysis.warnings || []).filter((warning) => warning !== sampleLabel);
  return (
    <section className="rd-analysis" aria-label="Analysis results" data-testid="analysis-results">
      <header className="rd-analysis-header">
        <h3>{label}</h3>
        <p>{analysisDescription(analysis)}</p>
        <p>{formatAnalysisCount(analysis.n_obs)} observations{covariance ? ` · ${covariance}` : ""}</p>
      </header>
      {analysis.sample_only === true ? (
        <p className="rd-analysis-sample" data-testid="analysis-sample-label">{sampleLabel}</p>
      ) : null}
      {warnings.length ? (
        <div className="rd-analysis-warnings" data-testid="analysis-warnings">
          <strong>Warnings</strong>
          <ul>{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
        </div>
      ) : null}
      {!values.length ? <p>Result rows are unavailable.</p> : (
        <>
          <div className="rd-analysis-table-wrap">
            {regression ? <RegressionTable rows={values} statistic={isBinaryModel(analysis) ? "z" : "t"} highlight={analysis.type === "did" ? analysis.interaction_term || "treated_x_post" : ""} /> : correlation ? <CorrelationTable matrix={matrix} /> : <EventTable rows={values} />}
          </div>
          {scale ? <p className="rd-analysis-note">{scale}</p> : null}
          {regression ? <FitStats analysis={analysis} /> : null}
          {isBinaryModel(analysis) ? <div className="rd-analysis-table-wrap"><MarginalEffectsTable effects={analysis.marginal_effects} /></div> : null}
          {analysis.type === "iv" ? <div className="rd-analysis-table-wrap"><FirstStageTable stages={analysis.first_stage} /></div> : null}
          <div className="rd-analysis-chart-wrap">
            {regression ? <RegressionChart rows={values} label={label} /> : correlation ? <CorrelationChart matrix={matrix} label={label} /> : <EventChart rows={values} label={label} />}
          </div>
        </>
      )}
      {analysis.dropped_rows > 0 ? <p className="rd-analysis-note">{formatAnalysisCount(analysis.dropped_rows)} rows dropped</p> : null}
    </section>
  );
}
