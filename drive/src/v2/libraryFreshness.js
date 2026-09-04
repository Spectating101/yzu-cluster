function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function clean(value) {
  return String(value ?? "").trim();
}

function explicitBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const raw = clean(value).toLowerCase();
  if (["true", "yes", "1", "stale", "overdue"].includes(raw)) return true;
  if (["false", "no", "0", "current", "fresh"].includes(raw)) return false;
  return null;
}

function parseTime(value) {
  const raw = clean(value);
  if (!raw) return 0;
  const time = Date.parse(raw);
  return Number.isNaN(time) ? 0 : time;
}

export function freshnessDate(value, { year = false } = {}) {
  const raw = clean(value);
  if (!raw) return "";
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const time = dateOnly
    ? Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : parseTime(raw);
  if (!time) return raw;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    ...(year ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(new Date(time));
}

export function refreshPolicyLabel(value) {
  const raw = clean(value);
  if (!raw) return "";
  const key = raw.toLowerCase().replace(/[\s-]+/g, "_");
  const labels = {
    hourly: "Hourly",
    daily: "Daily",
    weekdays: "Weekdays",
    weekly: "Weekly",
    biweekly: "Every 2 weeks",
    fortnightly: "Every 2 weeks",
    monthly: "Monthly",
    quarterly: "Quarterly",
    annual: "Annual",
    annually: "Annual",
    manual: "Manual",
    on_demand: "On demand",
    ondemand: "On demand",
    one_off: "One-off",
    one_time: "One-off",
    static: "Static",
    live: "Live",
    continuous: "Continuous",
    event_driven: "Event-driven",
  };
  if (labels[key]) return labels[key];
  const everyDays = key.match(/^every_?(\d+)_?days?$/);
  if (everyDays) return `Every ${everyDays[1]} days`;
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function staticPolicy(value) {
  return /^(static|one[_ -]?off|one[_ -]?time)$/i.test(clean(value));
}

function livePolicy(value) {
  return /^(live|continuous)$/i.test(clean(value));
}

export function summarizeLibraryFreshness(asset = {}, { kind = "" } = {}) {
  const refresh = asset?.refresh && typeof asset.refresh === "object" ? asset.refresh : {};
  const policy = firstValue(
    refresh.policy,
    asset?.refresh_policy,
    asset?.refresh_cadence,
    asset?.update_frequency,
    asset?.cadence,
  ) || null;
  const lastRefreshedAt = firstValue(
    refresh.last_refreshed_at,
    asset?.last_refreshed_at,
    asset?.data_refreshed_at,
    asset?.refreshed_at,
  ) || null;
  const dataAsOf = firstValue(
    refresh.data_as_of,
    refresh.as_of,
    asset?.data_as_of,
    asset?.as_of,
  ) || null;
  const nextRefreshAt = firstValue(refresh.next_refresh_at, asset?.next_refresh_at) || null;
  const recordUpdatedAt = firstValue(asset?.updated_at, asset?.last_modified) || null;
  const status = firstValue(refresh.status, asset?.refresh_status, asset?.pipeline_status) || null;
  const staleRaw = firstValue(refresh.stale, asset?.stale);
  const staleKnown = staleRaw !== undefined && staleRaw !== null && staleRaw !== "";
  const stale = explicitBoolean(staleRaw) === true;
  const cadenceLabel = refreshPolicyLabel(policy);
  const isStatic = staticPolicy(policy) || (kind === "scholarly_work" && !policy && !lastRefreshedAt && !dataAsOf);
  const isLive = livePolicy(policy);
  const hasPipeline = Boolean(policy || lastRefreshedAt || nextRefreshAt || status || staleKnown);
  const hasFreshnessEvidence = Boolean(dataAsOf || lastRefreshedAt || policy);

  let rootLabel = "Not tracked";
  if (stale) rootLabel = "Stale";
  else if (dataAsOf) rootLabel = `Through ${freshnessDate(dataAsOf)}`;
  else if (lastRefreshedAt) rootLabel = freshnessDate(lastRefreshedAt);
  else if (isStatic) rootLabel = "Static";
  else if (isLive) rootLabel = "Live";
  else if (cadenceLabel) rootLabel = cadenceLabel;

  let rootDetail = "";
  if (stale && lastRefreshedAt) {
    rootDetail = [freshnessDate(lastRefreshedAt), cadenceLabel].filter(Boolean).join(" · ");
  } else if ((dataAsOf || lastRefreshedAt) && cadenceLabel && !isStatic && !isLive) {
    rootDetail = cadenceLabel;
  } else if (!hasFreshnessEvidence && kind === "operational" && recordUpdatedAt) {
    rootLabel = `Record ${freshnessDate(recordUpdatedAt)}`;
  }

  let basisLabel = rootLabel;
  if (!stale && (dataAsOf || lastRefreshedAt) && cadenceLabel && !isStatic && !isLive) {
    basisLabel = `${rootLabel} · ${cadenceLabel}`;
  } else if (stale && cadenceLabel) {
    basisLabel = `Stale · ${cadenceLabel}`;
  }

  return {
    policy,
    cadenceLabel,
    lastRefreshedAt,
    dataAsOf,
    nextRefreshAt,
    recordUpdatedAt,
    status: status ? clean(status) : "",
    stale,
    staleKnown,
    isStatic,
    isLive,
    hasPipeline,
    hasFreshnessEvidence,
    rootLabel,
    rootDetail,
    basisLabel,
    sortTime: parseTime(dataAsOf) || parseTime(lastRefreshedAt) || 0,
  };
}
