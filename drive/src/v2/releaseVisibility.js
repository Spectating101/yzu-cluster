/**
 * Public Discover/Library release boundary.
 * Synthesis UI, routes, API hooks, and tests stay in-tree; public nav/deep links do not.
 */
export const SYNTHESIS_NAV_DEFERRED = true;

/** Where public `tab=synthesis` deep links land while Synthesis is deferred. */
export const SYNTHESIS_RELEASE_REDIRECT_TAB = "library";

export function normalizeReleaseTab(tab) {
  if (SYNTHESIS_NAV_DEFERRED && tab === "synthesis") {
    return SYNTHESIS_RELEASE_REDIRECT_TAB;
  }
  return tab;
}
