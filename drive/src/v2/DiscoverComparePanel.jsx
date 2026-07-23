import { assessDiscoverCandidate } from "@/v2/discoverCompare";
import { displayName } from "@/v2/datasetMeta";

/**
 * Qualitative lab relation for the selected source — no fake overlap percentages.
 */
export function DiscoverComparePanel({
  target,
  catalog = [],
  profile = null,
  peers = [],
  labIds = new Set(),
}) {
  if (!target) return null;

  const compare = assessDiscoverCandidate({ target, catalog, profile, peers, labIds });
  const lab = compare.labMatch;
  const showProfile = compare.profile && compare.profile.status !== "unknown";

  return (
    <section className="rd-v2-discover-compare" aria-label="Source comparison" data-testid="discover-compare">
      <p className="rd-v2-rail-section-label">How this compares</p>
      <p className="rd-v2-discover-compare-verdict">{compare.verdict}</p>

      {lab ? (
        <p className="rd-v2-discover-compare-lab">
          <strong>{lab.reason || "Lab relation"}</strong>
          <span>{displayName(lab.dataset)}</span>
        </p>
      ) : (
        <p className="rd-v2-discover-compare-lab muted">No close lab match — net-new acquisition</p>
      )}

      {showProfile ? (
        <p className="rd-v2-discover-compare-lab">
          <strong>Profile</strong>
          <span>
            {compare.profile.label}
            {compare.profile.detail ? ` · ${compare.profile.detail}` : ""}
          </span>
        </p>
      ) : null}
    </section>
  );
}
