import { ContextHelp } from "@/v2/InteractionGuidance";
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

const EXPLANATIONS = {
  "query-ready": "Registered, reconciled, and permitted for analysis in Research Drive.",
  registered: "Archived and registered as a durable asset, but not yet proven query ready.",
  connected: "Available through a connector or remote service; the bytes may not be owned locally.",
  review: "A researcher decision or approval is required before this item can advance.",
  failed: "The latest operation failed. Open Detail for evidence, identifiers, and retry guidance.",
  external: "Known outside the lab. Access, licensing, and acquisition still need verification.",
  remote: "Queried remotely rather than stored in the lab archive.",
  queued: "Accepted into the work queue but not currently executing.",
  warn: "Available with a condition that still needs attention.",
  unknown: "Research Drive cannot yet prove this asset's readiness state.",
};

export function StatusPill({ dataset, label }) {
  const state = statusPillKind(dataset);
  const text = label || state.label;
  const kind = state.kind;
  const cls = STYLES[kind] || STYLES.unknown;
  return (
    <span className={cls}>
      <span className="rd-v2-status-dot" aria-hidden />
      <span>{text}</span>
      <ContextHelp content={EXPLANATIONS[kind] || EXPLANATIONS.unknown} label={`Explain ${text}`} />
    </span>
  );
}
