import { statusPillKind } from "@/v2/datasetMeta";

const STYLES = {
  "query-ready": "rd-v2-status-pill rd-v2-status-ready",
  registered: "rd-v2-status-pill rd-v2-status-connected",
  connected: "rd-v2-status-pill rd-v2-status-connected",
  review: "rd-v2-status-pill rd-v2-status-review",
  failed: "rd-v2-status-pill rd-v2-status-failed",
  external: "rd-v2-status-pill rd-v2-status-external",
  remote: "rd-v2-status-pill rd-v2-status-external",
  unknown: "rd-v2-status-pill rd-v2-status-unknown",
  queued: "rd-v2-status-pill rd-v2-status-review",
  warn: "rd-v2-status-pill rd-v2-status-review",
};

/**
 * Status is deliberately non-interactive. Catalog rows are buttons, so embedding
 * help triggers here would create invalid nested buttons and ambiguous focus.
 * Detailed readiness guidance belongs in Detail | Ask for the selected object.
 */
export function StatusPill({ dataset, label }) {
  const state = statusPillKind(dataset);
  const text = label || state.label;
  const cls = STYLES[state.kind] || STYLES.unknown;
  return (
    <span className={cls} title={text}>
      <span className="rd-v2-status-dot" aria-hidden />
      <span>{text}</span>
    </span>
  );
}
