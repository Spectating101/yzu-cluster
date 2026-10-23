import { measuredComposerLabel } from "./resourcesTruth.js";
import { plainIdentifiers } from "./plainText.js";

function rowBase(row) {
  return { ok: true, warn: false, ...row };
}

function fmtGiB(gib) {
  if (gib == null) return "—";
  if (gib === 0) return "0 GiB";
  if (gib < 0.01) return "<0.01 GiB";
  return `${gib} GiB`;
}

function fmtCost(cost) {
  if (!cost || typeof cost !== "object") return "—";
  const parts = [];
  if (cost.bq_gib) parts.push(`BQ ${fmtGiB(cost.bq_gib)}`);
  if (cost.tavily) parts.push(`Tavily ${cost.tavily}`);
  if (cost.composer) parts.push(`Composer ${cost.composer}`);
  return parts.length ? parts.join(" · ") : "—";
}

function fmtTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function cleanTarget(target) {
  const text = String(target || "");
  return text.startsWith("[context:") && text.includes("]") ? text.split("]").slice(1).join("]").trim() : text;
}

function cleanActivitySubject(target, action) {
  let text = cleanTarget(target).replace(/\s+/g, " ").replace(/^web:\s*/i, "").trim();
  if (!text) return ACTION_LABELS[action] || action || "Activity";
  if (/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(text)) return plainIdentifiers(text);

  const currentRun = text.match(/^Explain the current procurement run:\s*([^.]+?)(?:\s*\(|\.|$)/i);
  if (currentRun?.[1]) return currentRun[1].trim();

  const datasetSearch = text.match(/^Find datasets for:\s*(.+)$/i);
  if (datasetSearch?.[1]) return datasetSearch[1].trim();

  const meter = text.match(/^Explain this Resources spending meter:\s*([^(.]+)(?:\s*\(|\.|$)/i);
  if (meter?.[1]) return `${meter[1].trim()} spending meter`;

  return text;
}

const ACTION_LABELS = {
  ask: "Ask",
  discover: "Discover search",
  discover_sources: "Source search",
  web: "Web context",
  bq_dry_run: "BigQuery cost check",
  bq_read: "BigQuery read",
  procure: "Procure",
  query: "Query dataset",
  preview: "Preview",
  job_submit: "Job submitted",
  job_approve: "Job approved",
  approve_collect: "Collect approved",
};

export function buildAccountSummaryRows(rollup) {
  if (!rollup) return [];
  const period = rollup.spending?.period?.totals || {};
  const today = rollup.spending?.today || {};
  const jobs = rollup.motion?.jobs || {};
  const workers = rollup.hero?.workers || {};
  const vault = rollup.hero?.vault || {};
  const usage = rollup.usage || {};

  return [
    rowBase({
      kind: "statement",
      key: "statement-ask",
      label: "Ask / model turns",
      metric: `${period.composer_turns ?? 0} month`,
      sublabel: `${today.composer_turns ?? 0} today`,
      detail: measuredComposerLabel(rollup.ai?.composer_model),
      section: "account",
    }),
    rowBase({
      kind: "statement",
      key: "statement-workers",
      label: "Workers",
      metric: `${workers.busy ?? "—"}/${workers.total ?? "—"} busy`,
      sublabel: `${jobs.pending_approval || 0} approvals`,
      detail: `${jobs.running || 0} running`,
      warn: (jobs.pending_approval || 0) > 0,
      section: "account",
    }),
    rowBase({
      kind: "statement",
      key: "statement-vault",
      label: "Vault",
      metric: vault.used_tb != null ? `${vault.used_tb}/${vault.cap_tb ?? "?"} TB` : "quota pending",
      sublabel: `cache ${usage.cache?.pct ?? "—"}%`,
      detail: `hot ${usage.hot?.used_pct ?? "—"}%`,
      section: "account",
    }),
  ];
}

export function buildActionRows(rollup) {
  return needsAttention(rollup).map((issue) =>
    rowBase({
      kind: "statement",
      key: `action-${issue.key}`,
      label: issue.label,
      metric: issue.section === "motion" ? "Approval needed" : "Check",
      sublabel: issue.section || "resources",
      detail: issue.section === "motion" ? "Review" : "Inspect",
      warn: true,
      section: "actions",
      issue,
    }),
  );
}

export function buildActivityRows(rollup, filter = null) {
  const events = rollup?.activity?.events || [];
  return events
    .filter((ev) => {
      if (!filter) return true;
      if (filter.hasCost) {
        return !!(ev.cost && Object.keys(ev.cost).length);
      }
      if (filter.actionGroup === "jobs") {
        return ["job_submit", "job_approve", "approve_collect"].includes(ev.action);
      }
      if (filter.actions) {
        return filter.actions.includes(ev.action);
      }
      if (filter.meterId === "bigquery") {
        return ev.cost?.bq_gib > 0;
      }
      if (filter.meterId === "tavily") {
        return ev.cost?.tavily > 0 || ev.action === "discover";
      }
      if (filter.meterId === "composer") {
        return ev.action === "ask" || ev.cost?.composer;
      }
      if (filter.action) {
        return ev.action === filter.action;
      }
      return true;
    })
    .map((ev) =>
      rowBase({
        kind: "activity",
        key: `act-${ev.id}`,
        label: cleanActivitySubject(ev.target, ev.action),
        metric: ACTION_LABELS[ev.action] || plainIdentifiers(ev.action),
        actionLabel: ACTION_LABELS[ev.action] || plainIdentifiers(ev.action),
        target: cleanTarget(ev.target),
        sublabel: fmtTime(ev.ts),
        costLabel: fmtCost(ev.cost),
        section: "activity",
        event: ev,
        ok: true,
      }),
    );
}

export function spendingPeriodLabel(rollup) {
  const p = rollup?.spending?.period;
  if (!p?.start || !p?.end) return "Last 30 days";
  return `${p.start} – ${p.end}`;
}

export function needsAttention(rollup) {
  const issues = rollup?.issues || [];
  const pending = rollup?.motion?.jobs?.pending_approval || 0;
  const out = [...issues];
  if (pending > 0 && !out.some((i) => i.key === "jobs-pending")) {
    out.push({ key: "jobs-pending", label: `${pending} job(s) awaiting approval`, section: "motion" });
  }
  return out;
}
