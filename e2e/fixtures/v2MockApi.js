/** Shared Playwright API mocks for Research Drive v2. */

import { MOCK_RESOURCES_ROLLUP } from "./mockResourcesRollup.js";

export const MOCK_DATASETS = {
  datasets: [
    {
      dataset_id: "gdelt_asia_daily_country_panel",
      name: "Asia daily news-risk panel",
      grain: "country_day",
      analysis_readiness: "instant",
      local_root: "research_panels/gdelt",
      source: "GDELT GKG",
      source_system: "GDELT news graph",
      join_keys: ["date", "country_iso3"],
      coverage: "2018–2024",
    },
    {
      dataset_id: "ticker_week_country_broadcast_panel",
      name: "Ticker week panel",
      grain: "country-week",
      analysis_readiness: "instant",
      source_system: "In-house derived research panels",
      join_keys: ["ticker", "week", "country_iso3"],
    },
    {
      dataset_id: "issuer_weekly_panel",
      name: "Issuer weekly fundamentals",
      grain: "issuer_week",
      analysis_readiness: "instant",
      source_system: "MOPS",
      source: "MOPS",
      join_keys: ["issuer_id", "week"],
    },
  ],
};

export const MOCK_DISCOVER_HIT = {
  sections: [
    {
      title: "Registry",
      rows: [
        {
          dataset_id: "mops_financial_statements_ext",
          candidate_key: "dataset:mops_financial_statements_ext",
          title: "MOPS financial statements (Taiwan)",
          source: "MOPS",
          collect_via: "mops_tw",
          url: "https://mops.twse.com.tw/example",
          coverage: "2015–2026",
          license: "Open Government",
          grain: "issuer-quarter",
          description: "TW listed company filings",
        },
      ],
    },
  ],
  total: 1,
};

export const MOCK_HEALTH = {
  status: "ok",
  datasets: 2,
  desk: {
    jobs: { running: 1, pending_approval: 1, gdelt_progress: "18 / 99 mo" },
    composer_configured: true,
    composer_model: "composer-2.5",
    mcp_tools: { total: 62, core: 13, acquire: 28, ops: 21 },
    storage_tiers: {
      canonical: { label: "GDrive vault", quota_tb: 5, used_tb: 2.1, pool_tb: 5 },
      hot: { label: "NVMe hot", used_pct: 68, free_gb: 56, headroom_ok: true },
      cache: { label: "USB bulk cache", mounted: true, used_gb: 1800, total_gb: 2000 },
    },
    gdrive: { ok: true },
    worker_pools: { busy: 2, total: 12 },
  },
};

export const MOCK_OVERVIEW = {
  total_datasets: 128,
  buckets: {
    instant_local: [
      { dataset_id: "gdelt_asia_daily_country_panel", name: "GDELT Asia", analysis_readiness: "instant" },
      { dataset_id: "ticker_week_country_broadcast_panel", name: "Ticker week", analysis_readiness: "instant" },
    ],
    remote_query: [{ dataset_id: "usdt_bigquery_catalogue", name: "USDT BQ", analysis_readiness: "dry_run" }],
    metadata_search: [{ dataset_id: "external_dataset_catalog", name: "External", analysis_readiness: "metadata_search" }],
    procurement_ops: [],
    other: [],
  },
};

export const MOCK_CATALOG_SUMMARY = {
  summary: {
    registry_datasets: 128,
    queue_tasks: 18,
    runnable_queue_tasks: 14,
    pipelines: 6,
    connectors: 3,
  },
};

export const MOCK_CLUSTER = {
  cluster: "yzu-cluster",
  controller: "optiplex",
  worker_pools: { windows_lab: { joined: 3, total: 4 } },
  disk: { free_gb: "56", used_pct: "68%" },
};

export const MOCK_OPS = {
  collection_queue: { pending: 2 },
  datacite_harvest: { running: 2, status: "warn" },
  query_engine: { ok: true },
};

export const MOCK_SYNTHESIS_PROFILES = {
  profiles: [
    {
      profile_id: "stablecoin_trust_engagement",
      title: "Stablecoin trust & engagement",
      type: "Research panel",
      objective: "Combine security, on-chain activity, and public attention into one weekly research panel.",
      inputs: [
        {
          dataset_id: "skynet_stablecoin_security",
          name: "Stablecoin security & governance",
          source: "CertiK Skynet",
          grain: "asset-week",
          coverage: "2021–2026",
          join_keys: ["asset_id", "week"],
          analysis_readiness: "instant",
        },
        {
          dataset_id: "etherscan_stablecoin_activity",
          name: "Stablecoin on-chain activity",
          source: "Etherscan",
          grain: "asset-day",
          coverage: "2021–2026",
          join_keys: ["asset_id", "date"],
          analysis_readiness: "instant",
        },
        {
          dataset_id: "stablecoin_attention_overlay",
          name: "Public attention overlay",
          source: "GDELT · Wikipedia · GitHub",
          grain: "asset-week",
          coverage: "2021–2026",
          join_keys: ["asset_id", "week"],
          analysis_readiness: "instant",
        },
      ],
      output: {
        dataset_id: "stablecoin_trust_weekly_panel",
        name: "Stablecoin trust weekly panel",
        grain: "asset-week",
        coverage: "2021–2026",
        destination: "Research panels",
      },
    },
    {
      profile_id: "skynet_etherscan_stablecoin",
      title: "Security × on-chain activity",
      type: "Two-source synthesis",
      objective: "Join governance and security signals to observed on-chain activity.",
      inputs: [
        {
          dataset_id: "skynet_stablecoin_security",
          name: "Stablecoin security & governance",
          source: "CertiK Skynet",
          grain: "asset-week",
          coverage: "2021–2026",
          join_keys: ["asset_id", "week"],
          analysis_readiness: "instant",
        },
        {
          dataset_id: "etherscan_stablecoin_activity",
          name: "Stablecoin on-chain activity",
          source: "Etherscan",
          grain: "asset-day",
          coverage: "2021–2026",
          join_keys: ["asset_id", "date"],
          analysis_readiness: "instant",
        },
      ],
      output: {
        dataset_id: "skynet_etherscan_stablecoin_panel",
        name: "Security and activity panel",
        grain: "asset-week",
        coverage: "2021–2026",
        destination: "Synthesis outputs",
      },
    },
  ],
};

export const MOCK_JOBS = {
  jobs: [
    {
      id: "job-pending-1",
      status: "pending_approval",
      type: "procure",
      candidate_key: null,
      connector_id: null,
      registered_dataset_id: null,
      output_manifest_id: null,
      plan: { title: "MOPS financial statements" },
    },
  ],
};

export const MOCK_PROBE_RESULT = {
  connector: {
    id: "example_com_data",
    connector_id: "example_com_data",
    status: "candidate",
    spec: {
      access_mode: "direct_file",
      content_type: "text/csv",
      source_url: "https://example.com/data.csv",
      discovered_files: [{ url: "https://example.com/data.csv" }],
    },
  },
  summary: "direct_file source; 1 downloadable links detected; recommendation: collect_manifest",
  resolved_url: "https://example.com/data.csv",
};

export const MOCK_WEB_DISCOVER = {
  query: "obscure dataset",
  sections: [
    {
      id: "web_discover",
      label: "Open web",
      rows: [
        {
          kind: "web_hit",
          title: "Example open dataset",
          url: "https://example.com/dataset",
          candidate_key: "url:https://example.com/dataset",
          source: "web",
          description: "Public CSV mirror",
        },
      ],
    },
  ],
  total: 1,
  index_miss: true,
};

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function applyMockSynthesisOps(state, operations = []) {
  const next = cloneJson(state || {});
  next.nodes = Array.isArray(next.nodes) ? next.nodes : [];
  next.edges = Array.isArray(next.edges) ? next.edges : [];
  next.activity = Array.isArray(next.activity) ? next.activity : [];
  next.spec = next.spec && typeof next.spec === "object" ? next.spec : {};
  for (const operation of operations) {
    if (!operation?.op) continue;
    if (operation.op === "update_node") {
      const index = next.nodes.findIndex((node) => node.id === operation.id);
      if (index >= 0) next.nodes[index] = { ...next.nodes[index], ...(operation.patch || {}) };
    } else if (operation.op === "remove_node") {
      next.nodes = next.nodes.filter((node) => node.id !== operation.id);
      next.edges = next.edges.filter((edge) => edge.source !== operation.id && edge.target !== operation.id);
    } else if (operation.op === "update_edge") {
      const index = next.edges.findIndex((edge) => edge.id === operation.id);
      if (index >= 0) next.edges[index] = { ...next.edges[index], ...(operation.patch || {}) };
    } else if (operation.op === "add_node" && operation.node?.id) {
      if (!next.nodes.some((node) => node.id === operation.node.id)) next.nodes.push({ ...operation.node });
    } else if (operation.op === "add_edge" && operation.edge?.id) {
      if (!next.edges.some((edge) => edge.id === operation.edge.id)) next.edges.push({ ...operation.edge });
    } else if (operation.op === "update_spec") {
      next.spec = { ...next.spec, ...(operation.patch || {}) };
    } else if (operation.op === "append_activity") {
      next.activity.push({ time: "Now", kind: "change", message: operation.message || "Synthesis state updated." });
    }
  }
  return next;
}

function acceptMockProposal(state) {
  const current = cloneJson(state || {});
  const proposal = current.proposal;
  if (!proposal) throw new Error("No synthesis proposal to accept.");
  const next = applyMockSynthesisOps(current, proposal.operations || []);
  next.proposal = null;
  next.lastActivity = proposal.title || "Proposal accepted";
  next.activity = Array.isArray(next.activity) ? next.activity : [];
  next.activity.push({
    time: "Now",
    kind: "decision",
    message: `Accepted proposal: ${proposal.title || proposal.id || "untitled"}.`,
  });
  return next;
}

function rejectMockProposal(state) {
  const current = cloneJson(state || {});
  const proposal = current.proposal;
  if (!proposal) throw new Error("No synthesis proposal to reject.");
  const nodeId = proposal.nodeId;
  const title = proposal.title || proposal.id || "proposal";
  const operations = nodeId
    ? [
        { op: "remove_node", id: nodeId },
        { op: "append_activity", message: `${title} rejected.` },
      ]
    : [{ op: "append_activity", message: `${title} rejected.` }];
  const next = applyMockSynthesisOps(current, operations);
  next.proposal = null;
  next.lastActivity = `${title} rejected`;
  return next;
}

function mockDiscoverHandoff(thread) {
  const state = thread.state || {};
  const held = [];
  const missing = [];
  for (const node of state.nodes || []) {
    if (!node || (node.type !== "source" && node.type !== "construct" && node.layer !== "evidence")) continue;
    const status = String(node.status || "");
    const identity = {
      id: node.id,
      label: node.label || node.id,
      status,
      type: node.type,
      role: node.role,
    };
    for (const key of ["dataset_id", "candidate_key", "source_identity", "source", "grain", "coverage"]) {
      if (node[key]) identity[key] = node[key];
    }
    if (["held", "queryable"].includes(status)) held.push(identity);
    if (["missing", "needs_access", "sourceable"].includes(status)) missing.push(identity);
  }
  return {
    thread_id: thread.id,
    objective: thread.objective || state.objective || "",
    required_grain: state.required_grain || state.spec?.grain || "",
    held_evidence: held,
    missing_evidence: missing,
    collection: null,
    fake_collection: false,
    note: "Conservative Discover handoff: objective, required grain, and held/missing evidence identities only. No acquisition jobs invented.",
  };
}

export async function mockV2Api(page, { discoverBody = { sections: [], total: 0 }, jobsBody = MOCK_JOBS } = {}) {
  const liveJobs = {
    jobs: Array.isArray(jobsBody?.jobs) ? [...jobsBody.jobs] : [],
  };
  const liveThreads = {
    threads: [],
  };
  const threadById = (id) => liveThreads.threads.find((thread) => thread.id === id) || null;
  await page.route("**/datasets", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_DATASETS) }),
  );
  await page.route("**/datasets/*", (route) => {
    const id = decodeURIComponent(route.request().url().split("/datasets/")[1]?.split("?")[0] || "");
    const row = MOCK_DATASETS.datasets.find((d) => d.dataset_id === id) || MOCK_DATASETS.datasets[0];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(row) });
  });
  await page.route("**/library/desk/resources*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_RESOURCES_ROLLUP),
    }),
  );
  await page.route("**/health*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_HEALTH) }),
  );
  await page.route("**/library/discover/probe", (route) => {
    if (route.request().method() !== "POST") {
      return route.continue();
    }
    let candidateKey = "";
    try {
      candidateKey = JSON.parse(route.request().postData() || "{}").candidate_key || "";
    } catch {
      candidateKey = "";
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...MOCK_PROBE_RESULT,
        candidate_key: candidateKey || null,
        connector_id: MOCK_PROBE_RESULT.connector.connector_id,
        resolved_url: MOCK_PROBE_RESULT.resolved_url,
      }),
    });
  });
  await page.route("**/library/discover/collect", (route) => {
    if (route.request().method() !== "POST") {
      return route.continue();
    }
    let body = {};
    try {
      body = JSON.parse(route.request().postData() || "{}");
    } catch {
      body = {};
    }
    const job = {
      id: `job-discover-collect-${liveJobs.jobs.length + 1}`,
      status: "pending_approval",
      candidate_key: body.candidate_key || null,
      connector_id: body.connector_id || null,
      registered_dataset_id: null,
      output_manifest_id: null,
      plan: { title: body.title || "Discover collect" },
      request: {
        candidate_key: body.candidate_key || null,
        connector_id: body.connector_id || null,
        source_identity: body.source_identity || body.source || null,
        dataset_id: body.dataset_id || null,
        doi: body.doi || null,
        url: body.url || null,
      },
    };
    liveJobs.jobs = [job, ...liveJobs.jobs.filter((j) => j?.id !== job.id)];
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ job }),
    });
  });
  await page.route("**/library/discover/web*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_WEB_DISCOVER),
    }),
  );
  await page.route("**/library/discover?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(discoverBody),
    }),
  );
  await page.route("**/library/discover", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(discoverBody),
    }),
  );
  await page.route("**/library/search*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sections: [], total: 0 }),
    }),
  );
  await page.route("**/library/ops*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_OPS) }),
  );
  await page.route("**/library/overview*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_OVERVIEW) }),
  );
  await page.route("**/library/catalog*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_CATALOG_SUMMARY) }),
  );
  await page.route("**/yzu/status*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_CLUSTER) }),
  );
  await page.route("**/library/jobs*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(liveJobs) }),
  );
  await page.route("**/library/partitions*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ partitions: [] }) }),
  );
  await page.route("**/library/synthesis/profiles", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_SYNTHESIS_PROFILES),
    }),
  );
  await page.route("**/library/synthesis/threads/*/patches", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const url = route.request().url();
    const threadId = decodeURIComponent(url.split("/library/synthesis/threads/")[1]?.split("/")[0] || "");
    const thread = threadById(threadId);
    if (!thread) {
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Thread not found" }),
      });
    }
    let body = {};
    try {
      body = JSON.parse(route.request().postData() || "{}");
    } catch {
      body = {};
    }
    const decision = String(body.decision || body.action || "").toLowerCase();
    try {
      if (body.proposal && typeof body.proposal === "object") {
        thread.state = { ...thread.state, proposal: body.proposal };
      }
      if (decision === "accept" || decision === "accepted" || decision === "apply_proposal") {
        thread.state = acceptMockProposal(thread.state);
      } else if (decision === "reject" || decision === "rejected") {
        thread.state = rejectMockProposal(thread.state);
      } else if (decision === "apply" || decision === "apply_operations" || decision === "patch") {
        if (!Array.isArray(body.operations)) throw new Error("operations are required for apply decisions");
        thread.state = applyMockSynthesisOps(thread.state, body.operations);
        thread.state.lastActivity = "Accepted synthesis patch applied.";
      } else {
        throw new Error("decision must be accept, reject, or apply");
      }
      thread.updated_at = new Date().toISOString();
      thread.materialisation = thread.state.materialisation || thread.materialisation || "not_materialised";
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(cloneJson(thread)),
      });
    } catch (err) {
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: err.message || String(err) }),
      });
    }
  });
  await page.route("**/library/synthesis/threads/*/proposal", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const threadId = decodeURIComponent(route.request().url().split("/library/synthesis/threads/")[1]?.split("/")[0] || "");
    const thread = threadById(threadId);
    if (!thread) {
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Thread not found" }),
      });
    }
    let body = {};
    try {
      body = JSON.parse(route.request().postData() || "{}");
    } catch {
      body = {};
    }
    thread.state = { ...thread.state, proposal: body.proposal ?? null };
    thread.updated_at = new Date().toISOString();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(cloneJson(thread)),
    });
  });
  await page.route("**/library/synthesis/threads/*/conversation", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const threadId = decodeURIComponent(
      route.request().url().split("/library/synthesis/threads/")[1]?.split("/")[0] || "",
    );
    const thread = threadById(threadId);
    if (!thread) {
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Thread not found" }),
      });
    }
    let body = {};
    try {
      body = JSON.parse(route.request().postData() || "{}");
    } catch {
      body = {};
    }
    const sessionId = String(body.session_id || body.session || "").trim();
    if (!sessionId) {
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "session_id is required" }),
      });
    }
    const conversationRaw = body.conversation_id ?? body.conversation;
    const conversationId = String(conversationRaw || "").trim();
    if (conversationRaw != null && conversationRaw !== "" && !conversationId) {
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "conversation_id must be a non-empty stable id when provided" }),
      });
    }
    thread.session_id = sessionId.slice(0, 64);
    if (conversationId) thread.conversation_id = conversationId.slice(0, 64);
    thread.updated_at = new Date().toISOString();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(cloneJson(thread)),
    });
  });
  await page.route("**/library/synthesis/threads/*/discover-handoff", (route) => {
    const threadId = decodeURIComponent(route.request().url().split("/library/synthesis/threads/")[1]?.split("/")[0] || "");
    const thread = threadById(threadId);
    if (!thread) {
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Thread not found" }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockDiscoverHandoff(thread)),
    });
  });
  await page.route("**/library/synthesis/threads/*/materialisation", (route) => {
    const threadId = decodeURIComponent(route.request().url().split("/library/synthesis/threads/")[1]?.split("/")[0] || "");
    const thread = threadById(threadId);
    if (!thread) {
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Thread not found" }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        thread_id: thread.id,
        materialisation: thread.materialisation || "not_materialised",
        executed: false,
        output_registered: false,
        execution_recorded: false,
        note: "Honest materialisation only: no output is claimed generated without an execution record on this thread.",
      }),
    });
  });
  await page.route("**/library/synthesis/threads/*", (route) => {
    const pathPart = route.request().url().split("/library/synthesis/threads/")[1] || "";
    const threadId = decodeURIComponent(pathPart.split("?")[0].split("/")[0] || "");
    if (!threadId || pathPart.includes("/")) return route.fallback();
    const thread = threadById(threadId);
    if (!thread) {
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Thread not found" }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(cloneJson(thread)),
    });
  });
  await page.route("**/library/synthesis/threads", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ threads: cloneJson(liveThreads.threads), total: liveThreads.threads.length }),
      });
    }
    if (method !== "POST") return route.continue();
    let body = {};
    try {
      body = JSON.parse(route.request().postData() || "{}");
    } catch {
      body = {};
    }
    const objective = String(body.objective || "").trim();
    if (!objective) {
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "objective is required" }),
      });
    }
    const stamp = new Date().toISOString();
    const state =
      body.state && typeof body.state === "object"
        ? cloneJson(body.state)
        : {
            title: body.title || objective.slice(0, 120),
            objective,
            required_grain: body.required_grain || body.grain || "",
            materialisation: "not_materialised",
            nodes: [],
            edges: [],
            proposal: null,
            activity: [],
            spec: {},
          };
    if (body.required_grain && !state.required_grain) state.required_grain = body.required_grain;
    state.objective = state.objective || objective;
    state.title = state.title || body.title || objective.slice(0, 120);
    state.materialisation = state.materialisation || "not_materialised";
    const thread = {
      id: `thread-${liveThreads.threads.length + 1}`,
      created_at: stamp,
      updated_at: stamp,
      title: String(body.title || state.title || objective).slice(0, 200),
      objective,
      session_id: body.session_id || "",
      conversation_id: body.conversation_id || "",
      materialisation: state.materialisation || "not_materialised",
      state,
      execution_recorded: false,
    };
    liveThreads.threads = [thread, ...liveThreads.threads];
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(cloneJson(thread)),
    });
  });
  await page.route("**/library/synthesis/threads?*", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ threads: cloneJson(liveThreads.threads), total: liveThreads.threads.length }),
    });
  });
  await page.route("**/library/synthesis/run", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    let body = {};
    try {
      body = JSON.parse(route.request().postData() || "{}");
    } catch {
      body = {};
    }
    const profile =
      MOCK_SYNTHESIS_PROFILES.profiles.find((item) => item.profile_id === body.profile_id) ||
      MOCK_SYNTHESIS_PROFILES.profiles[0];
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "completed",
        registered: true,
        registered_dataset_id: profile.output.dataset_id,
        row_count: 18432,
        output: { ...profile.output, registered: true },
      }),
    });
  });
  await page.route("**/library/synthesis/pair", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "completed",
        registered: false,
        output_dataset_id: "custom_pair_synthesis",
        row_count: 830,
        output: {
          dataset_id: "custom_pair_synthesis",
          name: "Custom pair synthesis",
          grain: "derived",
          coverage: "Computed from input overlap",
          destination: "Synthesis outputs",
        },
      }),
    });
  });
  await page.route("**/library/synthesis/*", (route) => {
    const id = decodeURIComponent(route.request().url().split("/library/synthesis/")[1]?.split("?")[0] || "");
    // This wildcard is registered last, so let the explicit profile/run/pair/threads routes handle their contracts.
    if (["profiles", "run", "pair", "threads"].includes(id) || id.startsWith("threads/")) return route.fallback();
    const profile =
      MOCK_SYNTHESIS_PROFILES.profiles.find((item) => item.profile_id === id) ||
      MOCK_SYNTHESIS_PROFILES.profiles[0];
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ profile }),
    });
  });
  await page.route("**/library/desk/warm", (route) => {
    if (route.request().method() !== "POST") {
      return route.continue();
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ primed: true, session_id: "warm-test" }),
    });
  });
  const chatSessions = new Map();
  const ensureChatSession = (sessionId) => {
    const sid = String(sessionId || "test-session").trim() || "test-session";
    if (!chatSessions.has(sid)) {
      chatSessions.set(sid, {
        session_id: sid,
        title: "Procurement chat",
        state: {},
        candidates: [],
        messages: [],
      });
    }
    return chatSessions.get(sid);
  };
  const fulfillChat = async (route) => {
    let body = {};
    try {
      body = JSON.parse(route.request().postData() || "{}");
    } catch {
      body = {};
    }
    const session = ensureChatSession(body.session_id || "test-session");
    const message = String(body.message || "").trim();
    if (message) {
      session.messages.push({ role: "user", content: message, artifacts: {} });
    }
    const reply = "Resources context received.";
    session.messages.push({ role: "assistant", content: reply, artifacts: {} });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        session_id: session.session_id,
        reply,
        action: "answer",
      }),
    });
  };
  await page.route("**/api/library/chat/stream", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "stream unavailable in mock" }),
    }),
  );
  await page.route("**/api/library/chat", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    return fulfillChat(route);
  });
  await page.route("**/api/library/chat/*", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const sessionId = decodeURIComponent(
      route.request().url().split("/library/chat/")[1]?.split("?")[0] || "",
    );
    const session = ensureChatSession(sessionId);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(cloneJson(session)),
    });
  });
  await page.route("**/yzu/acquisitions*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ acquisitions: [] }) }),
  );
  await page.route("**/library/faculty/profile*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ found: true, profile: { name_en: "Test Prof", discipline: "YZU" } }),
    }),
  );
  await page.route("**/query/*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ rows: [{ date: "2026-04-30", country: "TW", score: 0.82 }] }),
    }),
  );
}

export async function v2Nav(page, label) {
  await page.locator("aside.yzu-sidebar").getByRole("button", { name: label, exact: true }).click();
}

export async function waitForShell(page) {
  await page.locator(".rd-v2-shell").waitFor({ timeout: 30_000 });
}
