// One destination had two names. The nav said "Discover", the tab id said
// "browse", the component is BrowsePage, and ?tab=discover was rewritten to
// ?tab=browse — so a measurement labelled "browse" and a screenshot labelled
// "discover" were the same screen, and nothing said so. Same defect as four
// names for one dataset count.
//
// "discover" is canonical: it is what the nav shows and what a URL should read.
// "browse" stays accepted forever — roughly a hundred call sites emit it, and
// saved links use it.

export const DISCOVER_TAB = "discover";

const ALIASES = { browse: DISCOVER_TAB };

/** Fold any accepted spelling onto the canonical id. */
export function canonicalTab(tab) {
  const id = String(tab || "").trim().toLowerCase();
  return ALIASES[id] || id;
}

/** True when both spellings name the same destination. */
export function sameTab(a, b) {
  return canonicalTab(a) === canonicalTab(b);
}
