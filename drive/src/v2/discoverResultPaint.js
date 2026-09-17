/** Keep an already-painted field during another result leg for the same query. */
export function shouldAppendDiscoverPaint({ append = false, sameQuery = false, currentCount = 0 } = {}) {
  return Boolean(append || (sameQuery && Number(currentCount) > 0));
}

/** An empty partial response cannot establish that the complete search missed. */
export function discoverSearchOutcomeUnknown({ resultCount = 0, libraryFailed = false, routesFailed = false } = {}) {
  return Number(resultCount) === 0 && Boolean(libraryFailed || routesFailed);
}
