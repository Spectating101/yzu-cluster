import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("query-ready Library inspector renders reconstructed provenance without stronger claims", async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), "procurement-render-"));
  const server = await createServer({ configFile: false, plugins: [react()], cacheDir,
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { "@": fileURLToPath(new URL("../", import.meta.url)) } },
    server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { LibraryDatasetRailPanel } = await server.ssrLoadModule("/drive/src/v2/LibraryDatasetRailPanel.jsx");
    const markup = renderToStaticMarkup(createElement(LibraryDatasetRailPanel, { dataset: {
      dataset_id: "audit", analysis_readiness: "query_ready", backend: "local_csv_file",
      source_system: "FRED", source_url: "https://fred.stlouisfed.org/graph/fredgraph.csv?id=UNRATE",
      source_url_basis: "reconstructed_from_saved_recipe", collected_via: "public_api_collect",
      retrieved_at: "2026-10-05T04:50:53Z", coverage: { requested: { start: "2023-01-01", end: "2023-03-31" } },
    } }));
    assert.match(markup, /Saved source recipe/);
    assert.match(markup, /Endpoint from saved recipe/);
    assert.match(markup, /Original fetch URL was not recorded/);
    assert.match(markup, /Retrieved Oct 5/);
    assert.doesNotMatch(markup, /Exact source recorded|\[object Object\]/);
  } finally { await server.close(); await rm(cacheDir, { recursive: true, force: true }); }
});
