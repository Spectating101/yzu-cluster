import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transformWithEsbuild } from "vite";
import { renderToStaticMarkup } from "react-dom/server";
import { analysisDescription, analysisRows, analysisTypeLabel, correlationColor, correlationMatrix, covarianceLabel, eventGeometry, formatAnalysisCount, formatAnalysisNumber, formatAnalysisP, linearScale, regressionGeometry, zeroDomain } from "./analysisResults.js";

let AnalysisResults;
before(async () => {
  const source = await readFile(new URL("./AnalysisResults.jsx", import.meta.url), "utf8");
  const { code } = await transformWithEsbuild(source, "AnalysisResults.jsx", { loader: "jsx", jsx: "transform" });
  const resolved = code.replace('"react"', JSON.stringify(import.meta.resolve("react"))).replace('"./analysisResults.js"', JSON.stringify(new URL("./analysisResults.js", import.meta.url).href));
  ({ AnalysisResults } = await import(`data:text/javascript;base64,${Buffer.from(resolved).toString("base64")}`));
});
const row = { term: "year", coef: -0.520, se: 0.119, t: -4.37, p: 0.0001, ci_low: -0.754, ci_high: -0.286 };

describe("analysis number formatting", () => {
  it("uses three decimal places and preserves small p values", () => {
    assert.equal(formatAnalysisNumber(-0.52), "−0.520");
    assert.equal(formatAnalysisNumber(19), "19.000");
    assert.equal(formatAnalysisCount(10000), "10,000");
    assert.equal(formatAnalysisCount(null), "—");
    assert.equal(formatAnalysisNumber(-0.00001), "−0.00001");
    assert.equal(formatAnalysisNumber(0.000123), "0.000123");
    assert.equal(formatAnalysisNumber(0), "0.000");
    assert.equal(formatAnalysisP(0.0009), "< 0.001");
    assert.equal(formatAnalysisP(0), "< 0.001");
    assert.equal(formatAnalysisP(0.001), "0.001");
    assert.equal(formatAnalysisP(0.0251), "0.025");
  });
  it("does not turn undefined inference into zero", () => {
    for (const value of [null, undefined, NaN, Infinity, "0.1"]) {
      assert.equal(formatAnalysisNumber(value), "—");
      assert.equal(formatAnalysisP(value), "—");
    }
  });
});

describe("plain research labels", () => {
  it("names every supported method", () => {
    assert.deepEqual(["ols", "panel_fe", "correlation", "event_study"].map(analysisTypeLabel), ["Linear regression (OLS)", "Panel regression with fixed effects", "Correlation", "Event study"]);
  });
  it("reads outcome, predictors and covariance from the accepted spec", () => {
    const analysis = { type: "ols", spec: { outcome: "unemployment", predictors: ["year"], covariance: "cluster", cluster: "county" } };
    assert.equal(analysisDescription(analysis), "Outcome: unemployment · Predictors: year");
    assert.equal(covarianceLabel(analysis), "Clustered by county");
    assert.equal(covarianceLabel({ covariance: "cluster_entity", spec: { entity: "firm" } }), "Clustered by firm");
    assert.equal(covarianceLabel({ covariance: "HC1" }), "Robust (HC1)");
    assert.equal(covarianceLabel({ covariance: "nonrobust" }), "Classical");
    assert.equal(covarianceLabel({}), "");
  });
  it("describes correlation and event-study specifications", () => {
    assert.equal(analysisDescription({ type: "correlation", spec: { columns: ["x", "y"], method: "spearman" } }), "Spearman · x, y");
    assert.match(analysisDescription({ type: "event_study", spec: { return: "return", benchmark: "market", market_return: "market", event_window: [-2, 2], estimation_window: [-30, -5] } }), /Market benchmark: market.*Event window: -2 to 2.*Estimation window: -30 to -5/);
  });
});

describe("chart geometry", () => {
  it("scales coordinates and includes zero even for same-sign intervals", () => {
    assert.equal(linearScale([-1, 1], [0, 100])(0), 50);
    assert.equal(linearScale([1, 1], [0, 100])(1), 50);
    for (const values of [[1, 2], [-2, -1], [], [null, NaN]]) {
      const domain = zeroDomain(values);
      assert.ok(domain[0] < 0 && domain[1] > 0);
    }
  });
  it("positions coefficient points and CI whiskers and excludes const", () => {
    const geometry = regressionGeometry([{ ...row, term: "const", coef: 1000 }, row]);
    assert.equal(geometry.points.length, 1);
    const point = geometry.points[0];
    assert.ok(point.low < point.x && point.x < point.high && point.high < geometry.zero);
    assert.ok(geometry.zero <= 580);
    assert.equal(regressionGeometry([{ term: "x", coef: 1, ci_low: null, ci_high: null }]).points[0].low, null);
  });
  it("clamps heatmap colors to the fixed correlation domain", () => {
    assert.equal(correlationColor(-10), correlationColor(-1));
    assert.equal(correlationColor(10), correlationColor(1));
    assert.match(correlationColor(-1), /--rd-fail-fg/);
    assert.match(correlationColor(1), /--rd-link/);
    assert.match(correlationColor(0), /0%/);
    assert.equal(correlationColor(null), "var(--rd-canvas)");
    const matrix = correlationMatrix([{ var1: "x", var2: "y", r: 0.4, n: 10 }], ["x", "y"]);
    assert.equal(matrix.cell("x", "y").n, 10);
    assert.equal(matrix.cell("y", "x"), undefined);
  });
  it("sorts event days, draws CI bands and includes both zero rules", () => {
    const geometry = eventGeometry([{ rel_day: 1, car: 0.2, ci_low: 0.1, ci_high: 0.3 }, { rel_day: -1, car: 0.1, ci_low: 0, ci_high: 0.2 }]);
    assert.equal(geometry.points[0].row.rel_day, -1);
    assert.equal(geometry.bands[0].split(" ").length, 4);
    assert.ok(geometry.points[0].x < geometry.zeroX && geometry.zeroX < geometry.points[1].x);
    assert.ok(geometry.zeroY >= 24 && geometry.zeroY <= 240);
    assert.ok(geometry.points[1].high < geometry.points[1].y && geometry.points[1].y < geometry.points[1].low);
  });
  it("breaks event paths across undefined inference", () => {
    const geometry = eventGeometry([{ rel_day: -1, car: 0.1, ci_low: 0, ci_high: 0.2 }, { rel_day: 0, car: null, ci_low: null, ci_high: null }, { rel_day: 1, car: 0.2, ci_low: 0.1, ci_high: 0.3 }]);
    assert.equal(geometry.lines.length, 2);
    assert.equal(geometry.bands.length, 2);
  });
  it("uses inlined chart rows when query or Preview rows are absent or truncated", () => {
    const rows = [row];
    const chart = { data: { values: rows } };
    assert.equal(analysisRows(undefined, chart), rows);
    assert.equal(analysisRows([], chart), rows);
    assert.deepEqual(analysisRows(rows, null), rows);
    assert.deepEqual(analysisRows(undefined, null), []);
    assert.equal(analysisRows([row], { data: { values: [row, row] } }).length, 2);
  });
});

describe("analysis rendering", () => {
  it("renders nothing when analysis is absent even when rows exist", () => {
    assert.equal(AnalysisResults({ rows: [row] }), null);
    assert.equal(AnalysisResults({ analysis: null, chart: { data: { values: [row] } } }), null);
  });
  it("keeps sample labels and every warning visible before the table", () => {
    const html = renderToStaticMarkup(AnalysisResults({ analysis: { type: "ols", spec: { outcome: "unemployment", predictors: ["year"] }, n_obs: 288, warnings: ["few clusters", "second warning"], sample_only: true, label: "sample only — not the final estimate" }, rows: [row] }));
    assert.match(html, /sample only — not the final estimate/);
    assert.ok(html.indexOf("second warning") < html.indexOf("<table"));
    assert.match(html, /−0.520/);
    assert.match(html, /role="img" aria-label="Linear regression/);
    assert.doesNotMatch(html, /<details/);
  });
  it("renders chart fallback rows and correlation pair counts", () => {
    const rows = [{ var1: "x", var2: "y", r: -0.25, n: 288 }];
    const html = renderToStaticMarkup(AnalysisResults({ analysis: { type: "correlation", spec: { columns: ["x", "y"] }, n_obs: 288 }, chart: { data: { values: rows } } }));
    assert.match(html, /title="n = 288"/);
    assert.match(html, /−0.250/);
    assert.match(html, /role="img" aria-label="Correlation: correlation heatmap/);
  });
  it("keeps warnings when rows and chart values are unavailable", () => {
    const html = renderToStaticMarkup(AnalysisResults({ analysis: { type: "ols", spec: {}, warnings: ["Undefined inference"] } }));
    assert.match(html, /Undefined inference/);
    assert.match(html, /Result rows are unavailable/);
    assert.doesNotMatch(html, /<svg/);
  });
  it("reads the backend event count n and panel fit statistics", () => {
    const event = renderToStaticMarkup(AnalysisResults({ analysis: { type: "event_study", spec: {} }, rows: [{ rel_day: 0, car: 0.1, ci_low: 0, ci_high: 0.2, n: 12 }] }));
    assert.match(event, /<td>12<\/td>/);
    const panel = renderToStaticMarkup(AnalysisResults({ analysis: { type: "panel_fe", spec: {}, within_r2: 0.25 }, rows: [row] }));
    assert.match(panel, /Within R²/);
    assert.match(panel, /0.250/);
  });
});
