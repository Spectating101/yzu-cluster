/**
 * History noise fence — Phase 1 truth.
 *
 * Backend triage already cancels fixture/integration jobs with
 * `triage noise: fixture_*`. Those cancelled rows must not reappear as
 * professor-facing "Recovery required" lifecycle items.
 */

const NOISE_RE =
  /triage\s*noise|fixture[_ -]?(http_manifest|probe|h\b)|fixture_|no[_ -]?promotion|archive[_ -]?before[_ -]?promote|missing[_ -]?manifest|deploy\s*smoke|post-merge|day\d+\s*deploy|integration[_ -]?smoke|smoke:\s*http_manifest/i;

const FIXTURE_TARGET_RE = /^(raw_usdt_history|fixture[_-]|probe[_-]?no[_-]?promotion)/i;

/** Desk/Ask/search telemetry — useful audit, not durable procurement lifecycle. */
const SEARCH_TELEMETRY_ACTIONS =
  /^(ask|semantic_discover|discover|search|probe|query|preview|bq_)/i;

function blob(event) {
  const meta = event?.meta || {};
  return [
    event?.target,
    event?.title,
    event?.summary,
    event?.status,
    event?.error,
    meta.summary,
    meta.error,
    meta.status,
    meta.kind,
    event?.id,
  ]
    .filter(Boolean)
    .join("\n");
}

export function isHistoryNoise(event) {
  if (!event) return true;
  const text = blob(event);
  if (NOISE_RE.test(text)) return true;
  const target = String(event.target || event.title || "").trim();
  if (FIXTURE_TARGET_RE.test(target) && /fixture|triage|noise|stuck/i.test(text)) return true;
  if (event.meta?.noise === true || event.noise === true) return true;
  if (String(event.meta?.noise_reason || event.noise_reason || "").trim()) return true;
  return false;
}

/** Terra donor: Ask/search rows stay off the default durable trail. */
export function isDeskSearchTelemetry(event) {
  if (!event) return false;
  if (event.durable === true || event.kind === "collection_run") return false;
  const action = String(event.action || "").toLowerCase();
  if (SEARCH_TELEMETRY_ACTIONS.test(action)) return true;
  if (event.meta?.telemetry === true || event.telemetry === true) return true;
  if (event.meta?.ask_telemetry === true) return true;
  return false;
}

function collapseKey(event) {
  const target = String(event?.target || event?.title || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const status = String(event?.status || event?.meta?.status || "")
    .trim()
    .toLowerCase();
  const summary = String(event?.summary || event?.meta?.summary || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 120);
  return `${target}|${status}|${summary}`;
}

/**
 * @returns {{
 *   visible: object[],
 *   searchTelemetry: object[],
 *   hiddenNoise: number,
 *   hiddenSearchTelemetry: number,
 *   collapsedDuplicates: number,
 * }}
 */
export function fenceHistoryEvents(
  events = [],
  { includeNoise = false, includeSearchTelemetry = false } = {},
) {
  const list = Array.isArray(events) ? events.filter(Boolean) : [];
  const withoutNoise = includeNoise ? list : list.filter((event) => !isHistoryNoise(event));
  const hiddenNoise = list.length - withoutNoise.length;
  const searchTelemetry = withoutNoise.filter((event) => isDeskSearchTelemetry(event));
  const durable = includeSearchTelemetry
    ? withoutNoise
    : withoutNoise.filter((event) => !isDeskSearchTelemetry(event));
  const hiddenSearchTelemetry = includeSearchTelemetry ? 0 : searchTelemetry.length;

  const seen = new Set();
  const visible = [];
  let collapsedDuplicates = 0;
  for (const event of durable) {
    const key = collapseKey(event);
    if (!key || seen.has(key)) {
      collapsedDuplicates += 1;
      continue;
    }
    seen.add(key);
    visible.push(event);
  }

  return {
    visible,
    searchTelemetry,
    hiddenNoise,
    hiddenSearchTelemetry,
    collapsedDuplicates,
  };
}
