/**
 * Desk status is stated once in the header.
 *
 * The header renders a status badge derived from deskStatus, and separately
 * renders integration chips. Both can express the same condition — production
 * emits an integration chip literally labelled "Desk degraded" — which put two
 * identical pills side by side. Deriving the badge and filtering the chips
 * through one module keeps the rule in a single place.
 */

const TONE_VISIBLE = ["warn", "error", "danger", "bad"];

export function deskStatusBadge(deskStatus, usingSeed = false) {
  if (deskStatus === "ok") return { label: "Live registry", tone: "ok" };
  if (deskStatus === "syncing") return { label: "Syncing…", tone: "muted" };
  if (deskStatus === "empty") return { label: "Empty registry", tone: "warn" };
  if (usingSeed || deskStatus === "demo") return { label: "Demo catalog", tone: "warn" };
  if (deskStatus === "degraded") return { label: "Desk degraded", tone: "warn" };
  return { label: "Desk API offline", tone: "warn" };
}

function normalizeLabel(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Chips worth showing beside the status badge: attention-toned, not a restatement
 * of the badge, and not duplicated among themselves.
 */
export function visibleIntegrationChips(chips, statusLabel) {
  const list = Array.isArray(chips) ? chips : [];
  const taken = new Set([normalizeLabel(statusLabel)]);
  const out = [];
  for (const chip of list) {
    if (!chip || !TONE_VISIBLE.includes(chip.tone)) continue;
    const key = normalizeLabel(chip.label);
    if (!key || taken.has(key)) continue;
    taken.add(key);
    out.push(chip);
  }
  return out;
}

/**
 * Collapse operational warnings into one quiet, inspectable header affordance.
 * Detailed status belongs to Resources / Settings; the global shell only needs
 * to say whether attention is required without turning every warning into a
 * competing pill.
 */
export function deskStatusSummary(statusBadge, chips) {
  const badge = statusBadge || { label: "Desk status", tone: "muted" };
  const notices = visibleIntegrationChips(chips, badge.label)
    // Pending work already has its own precise, clickable count beside the
    // Library count. Repeating its age here made one fact occupy two badges.
    .filter((chip) => chip.id !== "debt");
  const attention = badge.tone !== "ok" && badge.tone !== "muted";

  if (!attention && notices.length === 0) {
    return { label: badge.label, tone: badge.tone, details: [badge.label] };
  }

  const details = [badge.label, ...notices.map((chip) => chip.label)];
  if (notices.length === 0) {
    return { label: badge.label, tone: badge.tone, details };
  }
  return {
    label: `${notices.length} desk ${notices.length === 1 ? "notice" : "notices"}`,
    tone: notices.some((chip) => ["bad", "danger", "error"].includes(chip.tone)) ? "bad" : "warn",
    details,
  };
}
